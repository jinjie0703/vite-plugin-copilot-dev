// plugins/vite-plugin-build-performance/index.ts
import { Plugin, createLogger } from 'vite'
import { analyzeConsoleIssues } from './ai/providers/llm'
import { CLIENT_INJECT_CODE } from './client/client'
import { setupBrowserMonitor } from './server/dev-assistant'
import { mountMcpTransport, setServer, pushBuildIssue } from './mcp'
import { RAGSystem } from './ai/rag'
import type { CopilotDevOptions, RAGOptions } from './types'
import path from 'path'

export default function vitePluginBuildPerformance(options: CopilotDevOptions = {}): Plugin {
  let hasBuildError = false
  const collectedIssues: { msg: string; count: number }[] = []
  let ragSystem: RAGSystem | null = null

  // 解析 MCP 配置
  const mcpOpts = typeof options.mcp === 'object'
    ? options.mcp
    : options.mcp === false
      ? { enabled: false }
      : { enabled: true }
  const enableMcp = mcpOpts.enabled !== false

  // 解析 RAG 配置
  const ragOpts: RAGOptions = typeof options.rag === 'object'
    ? { enabled: true, ...options.rag }
    : {
        enabled: options.rag !== false,
        indexDir: path.join(process.cwd(), '.vite/copilot/rag'),
        chunkSize: 1000,
        chunkOverlap: 200,
        excludePatterns: [],
      }

  function addIssue(level: 'warn' | 'error', msg: string) {
    if (options.logFilter && !options.logFilter(level, msg)) return
    const formattedMsg = (level === 'warn' ? 'WARNING: ' : 'ERROR: ') + msg

    const existing = collectedIssues.find(i => i.msg === formattedMsg)
    if (existing) {
      existing.count++
    } else {
      collectedIssues.push({ msg: formattedMsg, count: 1 })
    }

    if (enableMcp) {
      pushBuildIssue(level, formattedMsg)
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
    api: { 
      options,
      get rag() { return ragSystem }
    },

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
        code = code.replace(/__COPILOT_MONITOR_WINDOW_UNHANDLEDREJECTION__/g, String(monitorUnhandledrejection))
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
      if (enableMcp) {
        setServer(server)
        mountMcpTransport(server, mcpOpts.basePath)
      }

      if (enableMonitor) {
        setupBrowserMonitor(server, options, server.config.root)
      }

      if (ragOpts.enabled && options.llm?.apiKey) {
        ragSystem = new RAGSystem(options.llm, ragOpts)
        ragSystem.init().then(() => {
          if (ragSystem) {
            ragSystem.ingestor.ingestProject(server.config.root)
          }
        })
      }
    },

    async handleHotUpdate({ file }) {
      if (ragSystem && file.match(/\.(ts|tsx|js|jsx|vue|md)$/)) {
        await ragSystem.ingestor.ingestFile(file)
      }
    },

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

    async buildEnd(error) {
      if (process.env.NODE_ENV !== 'production') return
      if (error) {
        hasBuildError = true
        addIssue('error', 'FATAL ERROR: ' + error.message + '\n' + (error.stack || ''))
        const formatted = collectedIssues.map(i => i.count > 1 ? `${i.msg} [反复出现了 ${i.count} 次]` : i.msg)
        await analyzeConsoleIssues(formatted, options.llm || { apiKey: '' }, options.language, ragSystem)
      }
    },

    async closeBundle() {
      if (process.env.NODE_ENV !== 'production') return
      if (!hasBuildError && collectedIssues.length > 0) {
        const formatted = collectedIssues.map(i => i.count > 1 ? `${i.msg} [反复出现了 ${i.count} 次]` : i.msg)
        await analyzeConsoleIssues(formatted, options.llm || { apiKey: '' }, options.language, ragSystem)
      }
    },
  }
}
