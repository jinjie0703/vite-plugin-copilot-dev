// src/index.ts - vite-plugin-copilot-dev
import { Plugin, createLogger, type PluginOption } from 'vite'
import { fileURLToPath } from 'url'
import { setupServerMonitors } from './server'
import { mountMcpTransport, setServer, pushBuildIssue, closeMcpTransport, clearServer } from './mcp'
import type { CopilotDevOptions } from './types'
import path from 'path'

import { CopilotDevOptionsSchema } from './types/schema'

/**
 * Vite Copilot Plugin 核心入口点
 * 
 * 该插件作为一个中心调度器，主要负责：
 * 1. 在开发模式下，自动向客户端注入监控探针，并启动 Server 接收数据。
 * 2. 启动 MCP (Model Context Protocol) Server，打通大模型(IDE)与 Vite 运行时的通信。
 * 3. 在构建模式下，拦截构建错误并将其暴露给 MCP。
 * 
 * @param rawOptions - 插件原始配置项 (CopilotDevOptions)
 */
export default function viteCopilotPlugin(rawOptions: Partial<CopilotDevOptions> = {}): PluginOption {
  // 1. 严格解析并校验配置项 (Zod Runtime Validation)
  // 过滤掉无效参数，并自动填充默认值
  const options = CopilotDevOptionsSchema.parse(rawOptions) as CopilotDevOptions;

  // 缓存收集到的构建期 issue，防止重复上报
  const collectedIssues: { msg: string; count: number }[] = []

  // MCP 配置解析
  const mcpOpts = typeof options.mcp === 'object' ? options.mcp : { enabled: true, basePath: undefined }
  const enableMcp = mcpOpts.enabled !== false

  /**
   * 收集构建过程中的警告和错误
   * 包含过滤、去重逻辑，并将新发现的 issue 推送至 MCP
   */
  function addIssue(level: 'warn' | 'error', msg: string) {
    if (options.logFilter && !options.logFilter(level, msg)) return
    const formattedMsg = (level === 'warn' ? 'WARNING: ' : 'ERROR: ') + msg

    // 去重逻辑：如果已经存在相同的报错，则仅增加计数
    const existing = collectedIssues.find(i => i.msg === formattedMsg)
    if (existing) {
      existing.count++
    } else {
      collectedIssues.push({ msg: formattedMsg, count: 1 })
    }

    // 将构建期的 issue 实时推送给大模型
    if (enableMcp) {
      pushBuildIssue(level, formattedMsg)
    }
  }

  // 浏览器监控探针配置解析
  const browserMonitorOpts = typeof options.browserMonitor === 'object' ? options.browserMonitor : ({} as import('./types').BrowserMonitorOptions)
  const enableMonitor = options.browserMonitor !== false

  const monitorConsoleError = browserMonitorOpts.console?.error ?? true
  const monitorConsoleWarn = browserMonitorOpts.console?.warn ?? false
  const monitorWindowOnerror = browserMonitorOpts.window?.onerror ?? true
  const monitorUnhandledrejection = browserMonitorOpts.window?.unhandledrejection ?? true
  const monitorNetworkError = browserMonitorOpts.network?.error ?? false
  const monitorNetworkTimeout = browserMonitorOpts.network?.timeout ?? false

  // 虚拟模块 ID，用于在 Vite 内部欺骗打包器加载我们的客户端代码
  const VIRTUAL_CLIENT_ID = 'virtual:copilot-dev-client'

  const plugin: Plugin = {
    name: 'vite-plugin-copilot-dev',
    api: { 
      options
    },

    /**
     * Vite 钩子：解析模块 ID
     * 作用：当浏览器试图请求虚拟的客户端探针模块时，拦截请求并重定向到本地真正的 monitor.ts 文件
     */
    resolveId(id) {
      if (id === VIRTUAL_CLIENT_ID || id === `/${VIRTUAL_CLIENT_ID}`) {
        const _dirname = typeof __dirname !== 'undefined' ? __dirname : fileURLToPath(new URL('.', import.meta.url))
        return path.resolve(_dirname, '../src/client/monitor.ts')
      }
    },

    /**
     * Vite 钩子：转换 index.html
     * 作用：实现“无痕埋点”。在开发模式下，自动向用户的 index.html <head> 中注入配置变量和探针脚本
     */
    transformIndexHtml() {
      if (enableMonitor && process.env.NODE_ENV !== 'production') {
        const config: import('./types').BrowserMonitorOptions = {
          console: {
            error: monitorConsoleError,
            warn: monitorConsoleWarn,
          },
          window: {
            onerror: monitorWindowOnerror,
            unhandledrejection: monitorUnhandledrejection,
          },
          network: {
            error: monitorNetworkError,
            timeout: monitorNetworkTimeout,
          },
          cacheExpirySeconds: browserMonitorOpts.cacheExpirySeconds ?? 120,
        }
        return [
          // 注入全局配置对象
          {
            tag: 'script',
            children: `window.__COPILOT_CONFIG__ = ${JSON.stringify(config)};`,
            injectTo: 'head-prepend',
          },
          // 注入客户端探针代码 (通过虚拟模块 ID 引用)
          {
            tag: 'script',
            attrs: { type: 'module', src: `/@id/${VIRTUAL_CLIENT_ID}` },
            injectTo: 'head-prepend',
          },
        ]
      }
    },

    /**
     * Vite 钩子：配置开发服务器
     * 作用：这是插件后端的“大本营”。用于挂载各种中间件，连接外部服务。
     */
    configureServer(server) {
      if (enableMcp) {
        // 挂载 MCP 传输层通道 (stdio 或 SSE)，允许 AI IDE 连接到 Vite 开发服务器
        setServer(server)
        mountMcpTransport(server, mcpOpts.basePath)
      }

      if (enableMonitor) {
        // 挂载 API 路由中间件，用于接收浏览器探针 (monitor) 发送过来的报错数据
        setupServerMonitors(server, options, server.config.root)
      }

      // 优化 1：拦截开发环境下的 Vite 编译/语法错误
      // Vite 遇到编译错误时会通过 websocket 广播 type: 'error' 的负载，我们在这里拦截并同步给大模型
      const _send = server.ws.send;
      server.ws.send = function (...args: unknown[]) {
        let payload = args[0] as Record<string, unknown> | undefined
        // 兼容 Vite ws.send 的方法重载 (event, payload)
        if (typeof args[0] === 'string') {
          payload = { type: 'custom', event: args[0], data: args[1] }
        }
        
        if (payload && payload.type === 'error' && payload.err) {
          if (enableMcp) {
            const err = payload.err as { id?: string; message: string; stack?: string };
            const errorMsg = (err.id ? `File: ${err.id}\n` : '') + err.message + '\n' + (err.stack || '');
            pushBuildIssue('error', `[Dev Compilation Error] ${errorMsg}`);
          }
        }
        
        // 继续执行 Vite 原有的 WebSocket 发送逻辑
        return (_send as (...args: unknown[]) => void).apply(server.ws, args);
      };

      // 优化 2：监听服务器关闭事件，清理残留资源，防止重新编译时引发端口冲突(僵尸连接)
      server.httpServer?.on('close', () => {
        if (enableMcp) {
          closeMcpTransport();
          clearServer();
        }
      });
    },

    /**
     * Vite 钩子：解析 Vite 配置
     * 作用：仅在生产构建(build)期间生效。通过劫持 Vite 的日志器(Logger)，暗中收集打包过程中的警告和错误
     */
    config(userConfig, { command }) {
      if (command !== 'build') return
      const customLogger = userConfig.customLogger || createLogger()
      const originalWarn = customLogger.warn
      const originalError = customLogger.error

      // Monkey Patch 劫持警告日志
      customLogger.warn = (msg, opts) => {
        addIssue('warn', msg)
        originalWarn(msg, opts)
      }

      // Monkey Patch 劫持错误日志
      customLogger.error = (msg, opts) => {
        addIssue('error', msg)
        originalError(msg, opts)
      }

      userConfig.customLogger = customLogger
    },

    /**
     * Vite 钩子：构建结束
     * 作用：捕获导致打包崩溃的致命错误，并推送到 MCP
     */
    async buildEnd(error) {
      if (process.env.NODE_ENV !== 'production') return
      if (error) {
        addIssue('error', 'FATAL ERROR: ' + error.message + '\n' + (error.stack || ''))
      }
    },

    async closeBundle() {
      // 预留钩子，未来可用于在所有产物生成完毕后做数据清理或状态同步
    },
  }

  return plugin
}
