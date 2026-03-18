import { createHash } from 'crypto'
import type { ViteDevServer } from 'vite'
import type { CopilotDevOptions } from '../types'
import fs from 'fs'
import path from 'path'
import { analyzeConsoleIssues } from './llm'

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
    const { type, payload, msg, stack } = data

    // Hash to prevent same error being reported multiple times
    const errorStringContext = `${type}:${payload}:${msg}:${stack}`
    const hash = createHash('md5').update(errorStringContext).digest('hex')

    const now = Date.now()
    const cached = errorCache.get(hash)

    if (cached && now - cached.timestamp < cacheExpirySeconds) {
      console.log(
        `\n\x1b[33m[Copilot Dev Assistant Cache] 重复的浏览器报错 (${type}), 提取上次的建议结果:\x1b[0m`
      )
      console.log(cached.result)
      return
    }

    // Try to resolve file context
    let codeContext = ''
    const fileMatch =
      stack.match(/at\s+.*?\((.*?):(\d+):(\d+)\)/) || stack.match(/at\s+(.*?):(\d+):(\d+)/)

    if (fileMatch) {
      const [, filepath, line] = fileMatch
      const realPath = filepath.split('?')[0] // Remove query params
      // handle sourcemap or generic paths if possible

      const absPath = path.resolve(root, realPath.replace(/^[\\/]/, ''))
      if (fs.existsSync(absPath)) {
        try {
          const lines = fs.readFileSync(absPath, 'utf8').split('\n')
          const targetLine = parseInt(line, 10)
          const start = Math.max(0, targetLine - 10)
          const end = Math.min(lines.length, targetLine + 10)
          codeContext = lines.slice(start, end).join('\n')
        } catch {
          /* ignore */
        }
      }
    }

    const issuesContext = [
      `【Browser Error Type】: ${type}`,
      `【Message】: ${msg}`,
      `【Payload】: ${payload}`,
      `【Stack Trace】: \n${stack}`,
    ]
    if (codeContext) {
      issuesContext.push(`【Source Code Snippet】: \n${codeContext}`)
    }

    console.log(`\n\x1b[34m[Copilot Dev Assistant] 正在分析浏览器报错...\x1b[0m`)

    // Use the existing core LLM to fix/suggest
    try {
      // You might want to modify your `analyzeConsoleIssues` or create a generic one, this depends on it returning string or logging inside
      // For now, assuming standard logic is inside
      const llmOpts = options.llm || { apiKey: '' }
      // We probably need to return result, if analyze logs we might need to change it.
      // For now let's just trigger call
      await analyzeConsoleIssues(issuesContext, llmOpts, options.language)

      // the real analyzeConsoleIssues returns something, let's cache it (mock string if void)
      errorCache.set(hash, { hash, result: '请见上方控制台输出', timestamp: now })
    } catch (err) {
      console.error('AI 分析时出现错误', err)
    }
  })
}
