// plugins/vite-plugin-build-performance/index.ts
import { Plugin, createLogger } from 'vite'
import { analyzeConsoleIssues } from './ai/providers/llm'
import { CLIENT_INJECT_CODE } from './client/client'
import { setupBrowserMonitor } from './server/dev-assistant'
import type { CopilotDevOptions } from './types'

export default function vitePluginBuildPerformance(options: CopilotDevOptions = {}): Plugin {
  let hasBuildError = false
  const collectedIssues: { msg: string; count: number }[] = []

  function addIssue(level: 'warn' | 'error', msg: string) {
    if (options.logFilter && !options.logFilter(level, msg)) return
    const formattedMsg = (level === 'warn' ? 'WARNING: ' : 'ERROR: ') + msg

    // 去重逻辑：如果该日志已经出现过，则只增加计数
    const existing = collectedIssues.find(i => i.msg === formattedMsg)
    if (existing) {
      existing.count++
    } else {
      collectedIssues.push({ msg: formattedMsg, count: 1 })
    }
  }

  const browserMonitorOpts =
    typeof options.browserMonitor === 'object'
      ? options.browserMonitor
      : options.browserMonitor === false
        ? undefined
        : {}

  const enableMonitor = options.browserMonitor !== false

  const monitorConsoleError = browserMonitorOpts?.console?.error ?? true
  const monitorConsoleWarn = browserMonitorOpts?.console?.warn ?? false
  const monitorWindowOnerror = browserMonitorOpts?.window?.onerror ?? true
  const monitorUnhandledrejection = browserMonitorOpts?.window?.unhandledrejection ?? true
  const monitorNetworkError = browserMonitorOpts?.network?.error ?? false
  const monitorNetworkTimeout = browserMonitorOpts?.network?.timeout ?? false

  const VIRTUAL_CLIENT_ID = 'virtual:copilot-dev-client'
  const RESOLVED_VIRTUAL_CLIENT_ID = '\0' + VIRTUAL_CLIENT_ID

  return {
    name: 'vite-plugin-build-performance',
    api: { options }, // 导出 options 给外部读取
    // Note: We remove `apply: 'build'` since we want dev features too.
    // We'll constrain specific hooks respectively.

    resolveId(id) {
      if (id === VIRTUAL_CLIENT_ID || id === `/${VIRTUAL_CLIENT_ID}`) {
        return RESOLVED_VIRTUAL_CLIENT_ID
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_CLIENT_ID) {
        let code = CLIENT_INJECT_CODE
        code = code.replace(/__COPILOT_MONITOR_CONSOLE_ERROR__/g, String(monitorConsoleError))
        code = code.replace(/__COPILOT_MONITOR_CONSOLE_WARN__/g, String(monitorConsoleWarn))
        code = code.replace(/__COPILOT_MONITOR_WINDOW_ONERROR__/g, String(monitorWindowOnerror))
        code = code.replace(
          /__COPILOT_MONITOR_WINDOW_UNHANDLEDREJECTION__/g,
          String(monitorUnhandledrejection)
        )
        code = code.replace(/__COPILOT_MONITOR_NETWORK_ERROR__/g, String(monitorNetworkError))
        code = code.replace(/__COPILOT_MONITOR_NETWORK_TIMEOUT__/g, String(monitorNetworkTimeout))
        return code
      }
    },

    transformIndexHtml() {
      if (enableMonitor && process.env.NODE_ENV !== 'production') {
        return [
          {
            tag: 'script',
            attrs: { type: 'module', src: `/${VIRTUAL_CLIENT_ID}` },
            injectTo: 'head-prepend',
          },
        ]
      }
    },

    configureServer(server) {
      if (enableMonitor) {
        setupBrowserMonitor(server, options, server.config.root)
      }
    },

    // 配置早期拦截：劫持并收集 Vite 的警告和报错日志 (Build hook)
    config(userConfig, { command }) {
      if (command !== 'build') return
      const customLogger = userConfig.customLogger || createLogger()
      const originalWarn = customLogger.warn
      const originalError = customLogger.error

      customLogger.warn = (msg, opts) => {
        addIssue('warn', msg)
        originalWarn(msg, opts)
      }

      customLogger.error = (msg, opts) => {
        addIssue('error', msg)
        originalError(msg, opts)
      }

      userConfig.customLogger = customLogger
    },

    // 监听构建结束：如果抛出了致死错误，立马进行 AI 请求 (Build hook)
    async buildEnd(error) {
      // 避免 dev 模式下无限触发
      if (process.env.NODE_ENV !== 'production') return

      if (error) {
        hasBuildError = true
        addIssue('error', 'FATAL ERROR: ' + error.message + '\n' + (error.stack || ''))
        // 这一步虽然依然会在 Vite 最后抛出堆栈前，但好处是能抓到 Rollup 层面无法挽回的崩溃
        const formatted = collectedIssues.map(i =>
          i.count > 1 ? `${i.msg} [反复出现了 ${i.count} 次]` : i.msg
        )
        await analyzeConsoleIssues(formatted, options.llm || { apiKey: '' }, options.language)
      }
    },

    // The closeBundle hook runs after Vite has finished processing the build
    async closeBundle() {
      // 避免 dev 模式下执行审查
      if (process.env.NODE_ENV !== 'production') return

      // 成功构建的话，依然可能遗留刚才拦截到的超大 Chunk 拆包警告，送给 AI 分析！
      if (!hasBuildError && collectedIssues.length > 0) {
        const formatted = collectedIssues.map(i =>
          i.count > 1 ? `${i.msg} [反复出现了 ${i.count} 次]` : i.msg
        )
        await analyzeConsoleIssues(formatted, options.llm || { apiKey: '' }, options.language)
      }
    },
  }
}
