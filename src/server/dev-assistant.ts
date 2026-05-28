import { createHash } from 'crypto'
import type { ViteDevServer } from 'vite'
import type { CopilotDevOptions } from '../types'
import fs from 'fs'
import path from 'path'
import { desensitizePayload } from '../utils/desensitize'

// Error Analysis Cache
interface CacheEntry {
  hash: string
  result: string
  timestamp: number
}
const errorCache = new Map<string, CacheEntry>()

export function setupBrowserMonitor(
  server: ViteDevServer,
  options: CopilotDevOptions,
  root: string
) {
  const browserMonitorOpts =
    typeof options.browserMonitor === 'object' ? options.browserMonitor : {}
  let cacheExpirySeconds = browserMonitorOpts.cacheExpirySeconds || 120
  cacheExpirySeconds = cacheExpirySeconds * 1000 // ms

  server.ws.on('copilot:browser-error', async data => {
    let { type, payload, msg, stack } = data

    // 内置降噪和脱敏
    msg = typeof msg === 'string' ? desensitizePayload(msg) : msg
    payload = desensitizePayload(payload)

    // 尝试解析并读取代码上下文片段
    let codeContext = ''
    const fileMatch =
      stack.match(/at\s+.*?\((.*?):(\d+):(\d+)\)/) || stack.match(/at\s+(.*?):(\d+):(\d+)/)

    if (fileMatch) {
      const [, filepath, lineStr, colStr] = fileMatch
      let rawUrl = filepath
      if (rawUrl.startsWith('http')) {
        try {
          rawUrl = new URL(rawUrl).pathname + new URL(rawUrl).search
        } catch {}
      }
      
      const cleanUrl = rawUrl.split('?')[0]
      let targetLine = parseInt(lineStr, 10)
      let targetCol = parseInt(colStr, 10)

      let absPath = path.resolve(root, cleanUrl.replace(/^[\\/]/, ''))

      // 尝试通过 Vite ModuleGraph 拿到 Sourcemap 还原真实位置
      try {
        const moduleNode = await server.moduleGraph.getModuleByUrl(rawUrl) || await server.moduleGraph.getModuleByUrl(cleanUrl)
        if (moduleNode?.transformResult?.map) {
          const { SourceMapConsumer } = await import('source-map')
          const consumer = await new SourceMapConsumer(moduleNode.transformResult.map as any)
          const originalPosition = consumer.originalPositionFor({
            line: targetLine,
            column: targetCol,
          })

          if (originalPosition.line != null) {
            targetLine = originalPosition.line
            // 有些时候原始文件路径在 sourcemap 里会更精准，但作为兜底我们先信任 absPath
            if (originalPosition.source && originalPosition.source !== 'null') {
              // Vite 的 source path 通常是绝对路径，或者是相对于 root 的路径
              const resolvedSourcePath = path.resolve(root, originalPosition.source.replace(/^webpack:\/\/\//, '').replace(/^[\\/]/, ''))
              if (fs.existsSync(resolvedSourcePath)) {
                absPath = resolvedSourcePath
              }
            }
          }
          consumer.destroy()
        }
      } catch (e) {
        // SourceMap 解析失败，静默降级到原始行列号
      }

      if (fs.existsSync(absPath)) {
        try {
          const lines = fs.readFileSync(absPath, 'utf8').split('\n')
          const start = Math.max(0, targetLine - 10)
          const end = Math.min(lines.length, targetLine + 10)
          
          // 给报错行加上明显的标记
          codeContext = lines.slice(start, end).map((l, i) => {
            const currentLineNum = start + i + 1
            const prefix = currentLineNum === targetLine ? '  > ' : '    '
            return `${prefix}${currentLineNum} | ${l}`
          }).join('\n')
          
          // 把真实的文件路径和行号附加到上下文中
          codeContext = `File: ${absPath}:${targetLine}\n\n${codeContext}`
        } catch {
          /* ignore */
        }
      }
    }

    // 执行用户可能配置的自定义 beforeAnalyze 钩子
    if (browserMonitorOpts.beforeAnalyze) {
      const handled = browserMonitorOpts.beforeAnalyze({ type, msg, payload, stack, codeContext })
      // 返回 false 或 null 则表示拦截，不发送大模型
      if (!handled) {
        return
      }
      type = handled.type || type
      msg = handled.msg || msg
      payload = handled.payload || payload
      stack = handled.stack || stack
      codeContext = handled.codeContext || codeContext
    }

    // Hash to prevent same error being reported multiple times
    const errorStringContext = `${type}:${JSON.stringify(payload)}:${msg}:${stack}`
    const hash = createHash('md5').update(errorStringContext).digest('hex')

    const now = Date.now()
    const cached = errorCache.get(hash)

    if (cached && now - cached.timestamp < cacheExpirySeconds) {
      return
    }

    console.log(`\n\x1b[33m⚠️ [Copilot-Dev] 捕获到浏览器报错: ${msg}\x1b[0m`)
    console.log(`\x1b[34m💡 已通过 MCP 暴露诊断上下文资源，请向你的 AI IDE 提问诊断此报错。\x1b[0m\n`)

    errorCache.set(hash, { hash, result: 'cached', timestamp: now })
  })
}
