// MCP Server 相关类型定义

import type { ViteDevServer } from 'vite'

/**
 * MCP Server 运行时需要的 Vite 上下文快照。
 * 由 Vite 插件在生命周期中维护并注入给 MCP Server。
 */
export interface ViteContext {
  /** ViteDevServer 实例引用 */
  server: ViteDevServer | null
  /** 项目根目录绝对路径 */
  root: string
  /** 收集到的构建/编译错误 */
  buildErrors: BuildIssueEntry[]
  /** 收集到的构建/编译警告 */
  buildWarnings: BuildIssueEntry[]
  /** 从浏览器运行时拦截到的异常 */
  browserErrors: BrowserErrorEntry[]
}

export interface BuildIssueEntry {
  level: 'warn' | 'error'
  message: string
  count: number
  timestamp: number
}

export interface BrowserErrorEntry {
  type: string
  message: string
  payload: string
  stack: string
  codeContext?: string
  timestamp: number
}

/**
 * MCP Server 的配置选项，由用户在 CopilotDevOptions 中设置。
 */
export interface McpServerOptions {
  /** 是否启用 MCP Server，默认 true */
  enabled?: boolean
  /** MCP SSE 挂载路径前缀，默认 '/__copilot_mcp' */
  basePath?: string
}