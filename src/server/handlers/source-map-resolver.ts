import fs from 'fs'
import path from 'path'
import type { ViteDevServer } from 'vite'
import { parse } from 'stacktrace-parser'
import { codeFrameColumns } from '@babel/code-frame'

export async function resolveErrorCodeContext(
  server: ViteDevServer,
  root: string,
  stack: string
): Promise<string> {
  let codeContext = ''
  if (!stack || typeof stack !== 'string') return codeContext

  const frames = parse(stack)
  if (!frames || frames.length === 0) return codeContext

  const frame = frames.find(f => f.file && !f.file.includes('node_modules')) || frames[0]
  if (!frame || !frame.file) return codeContext

  let rawUrl = frame.file
  if (rawUrl.startsWith('http')) {
    try {
      rawUrl = new URL(rawUrl).pathname + new URL(rawUrl).search
    } catch {}
  }
  
  const cleanUrl = rawUrl.split('?')[0]
  let targetLine = frame.lineNumber || 1
  let targetCol = frame.column || 1

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
      const fileContent = fs.readFileSync(absPath, 'utf8')
      const codeFrame = codeFrameColumns(fileContent, {
        start: { line: targetLine, column: targetCol }
      }, {
        highlightCode: false,
        linesAbove: 5,
        linesBelow: 5
      })
      
      // 把真实的文件路径和行号附加到上下文中
      codeContext = `File: ${absPath}:${targetLine}\n\n${codeFrame}`
    } catch {
      /* ignore */
    }
  }

  return codeContext
}
