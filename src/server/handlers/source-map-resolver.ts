import fs from 'fs'
import path from 'path'
import type { ViteDevServer } from 'vite'

export async function resolveErrorCodeContext(
  server: ViteDevServer,
  root: string,
  stack: string
): Promise<string> {
  let codeContext = ''
  if (!stack || typeof stack !== 'string') return codeContext

  const fileMatch =
    stack.match(/at\s+.*?\((.*?):(\d+):(\d+)\)/) || stack.match(/at\s+(.*?):(\d+):(\d+)/)

  if (!fileMatch) return codeContext

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

  return codeContext
}
