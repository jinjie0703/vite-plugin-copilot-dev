// plugins/vite-plugin-build-performance/index.ts
import { Plugin, createLogger } from 'vite'
import { fileURLToPath } from 'url'
import { setupServerMonitors } from './server'
import { mountMcpTransport, setServer, pushBuildIssue } from './mcp'
import type { CopilotDevOptions } from './types'
import path from 'path'

export default function viteCopilotPlugin(options: CopilotDevOptions = {}): any {
  let hasBuildError = false
  const collectedIssues: { msg: string; count: number }[] = []

  // 解析 MCP 配置
  const mcpOpts = typeof options.mcp === 'object'
    ? options.mcp
    : options.mcp === false
      ? { enabled: false }
      : { enabled: true }
  const enableMcp = mcpOpts.enabled !== false

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

  const plugin: Plugin = {
    name: 'vite-plugin-copilot-dev',
    api: { 
      options
    },

    resolveId(id) {
      if (id === VIRTUAL_CLIENT_ID || id === `/${VIRTUAL_CLIENT_ID}`) {
        const _dirname = typeof __dirname !== 'undefined' ? __dirname : fileURLToPath(new URL('.', import.meta.url))
        return path.resolve(_dirname, '../src/client/monitor.ts')
      }
    },

    transformIndexHtml() {
      if (enableMonitor && process.env.NODE_ENV !== 'production') {
        const config = {
          monitorConsoleError,
          monitorConsoleWarn,
          monitorWindowOnerror,
          monitorUnhandledrejection,
          monitorNetworkError,
          monitorNetworkTimeout
        }
        return [
          {
            tag: 'script',
            children: `window.__COPILOT_CONFIG__ = ${JSON.stringify(config)};`,
            injectTo: 'head-prepend',
          },
          {
            tag: 'script',
            attrs: { type: 'module', src: `/@id/${VIRTUAL_CLIENT_ID}` },
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
        setupServerMonitors(server, options, server.config.root)
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
      }
    },

    async closeBundle() {
      // reserved for future use
    },
  }

  return plugin as any
}
