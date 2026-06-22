import { createHash } from 'crypto'
import type { ViteDevServer } from 'vite'
import type { CopilotDevOptions } from '../../types'
import { pushBrowserError } from '../../mcp/context'
import { resolveErrorCodeContext } from './source-map-resolver'

// Error Analysis Cache
interface CacheEntry {
  hash: string
  result: string
  timestamp: number
}
const errorCache = new Map<string, CacheEntry>()

export function setupBrowserErrorHandler(
  server: ViteDevServer,
  options: CopilotDevOptions,
  root: string
) {
  const browserMonitorOpts =
    (typeof options.browserMonitor === 'object' ? options.browserMonitor : {}) as { cacheExpirySeconds?: number }
  let cacheExpirySeconds = browserMonitorOpts.cacheExpirySeconds || 120
  cacheExpirySeconds = cacheExpirySeconds * 1000 // ms

  server.ws.on('copilot:browser-error', async data => {
    try {
      let { type, payload, msg, stack } = data

      // 尝试解析并读取代码上下文片段
      let codeContext = await resolveErrorCodeContext(server, root, stack)

      // 执行用户可能配置的自定义 beforeAnalyze 钩子
      if (browserMonitorOpts.beforeAnalyze) {
        const handled = browserMonitorOpts.beforeAnalyze({ type, msg, payload, stack, codeContext })
        // 返回 false 或 null 则表示拦截，不会暴露到 MCP 上下文
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

      pushBrowserError({
        type,
        message: msg,
        payload: JSON.stringify(payload),
        stack,
        codeContext
      })

      errorCache.set(hash, { hash, result: 'cached', timestamp: now })
    } catch (err) {
      console.error('\x1b[31m%s\x1b[0m', '[Copilot-Dev] Error handling browser error event:', err)
    }
  })
}
