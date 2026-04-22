// Vite 生命周期交互的类型
import type { LLMOptions, RAGOptions } from './ai'
import type { McpServerOptions } from './mcp'

export type Locale = 'zh-CN' | 'en-US' | string

/** 浏览器监控配置选项 */
export interface BrowserMonitorOptions {
  /** 控制台拦截配置 */
  console?: {
    /** 是否拦截 console.error，默认 true */
    error?: boolean
    /** 是否拦截 console.warn，默认 false */
    warn?: boolean
  }
  /** 全局窗口事件拦截配置 */
  window?: {
    /** 是否拦截 window.onerror (运行时 JS 错误)，默认 true */
    onerror?: boolean
    /** 是否拦截 window.onunhandledrejection (未捕获的 Promise 错误)，默认 true */
    unhandledrejection?: boolean
  }
  /** 网络请求拦截配置 (目前主要用于错误上报) */
  network?: {
    /** 是否记录网络请求错误，默认 false */
    error?: boolean
    /** 是否记录网络超时，默认 false */
    timeout?: boolean
  }
}

export interface CopilotDevOptions {
  /** 新增多语言和 LLM 配置 */
  language?: Locale
  llm?: LLMOptions
  /** 浏览器终端监控配置 */
  browserMonitor?: boolean | BrowserMonitorOptions
  /**
   * 自定义构建日志过滤函数，返回 false 的警告/报错将被丢弃，不会发送给 AI。
   * 可以用来过滤掉确知的第三方库无用警告，提高信噪比并节省 Token。
   */
  logFilter?: (level: 'warn' | 'error', msg: string) => boolean
  /**
   * MCP (Model Context Protocol) Server 配置。
   * 启用后，插件会在 Vite Dev Server 上暴露 MCP SSE 端点，
   * 让外部 AI IDE（如 Cursor、Claude Desktop）可以读取 Vite 运行时状态。
   * 设置为 true 使用默认配置，设置为对象进行自定义配置，设置为 false 禁用。
   * 默认启用。
   */
  mcp?: boolean | McpServerOptions
  /**
   * RAG (Retrieval-Augmented Generation) 配置。
   * 用于索引项目文件，为 AI 诊断提供更精准的上下文。
   */
  rag?: boolean | RAGOptions
}