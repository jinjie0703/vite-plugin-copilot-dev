// plugins/vite-plugin-build-performance/types.ts
declare module 'chrome-launcher' {}
declare module 'lighthouse' {}

export type Locale = 'zh-CN' | 'en-US' | string

export interface LLMPromptOptions {
  /**
   * 用于 Vite 构建过程中控制台警告/报错分析的 Customize Prompt。
   * 建议在 Prompt 中明确要求返回的格式（例如 JSON）。
   */
  buildIssues?: string
  /**
   * 用于外层 ai-runner 捕获到进程崩溃时的 Customize Prompt。
   * 建议在 Prompt 中明确要求返回的格式（例如 JSON）。
   */
  crashDiagnostics?: string
}

export interface LLMOptions {
  apiKey: string
  baseURL?: string
  model?: string
  maxTokens?: number
  prompts?: LLMPromptOptions
}

// 定义错误诊断报告的数据结构
export interface DiagnosticResult {
  reason: string
  suggestion: string
  codeSnippet?: string
}

export interface LighthouseOptions {
  outDir?: string
  targetPath?: string
  // 新增多语言和 LLM 配置
  language?: Locale
  llm?: LLMOptions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBeforeRun?: (browser: any, page: any, serverUrl: string) => Promise<void>
  // 允许的最长加载等待时间，用于地图等重资源，单位毫秒。默认 90000 (90秒)
  maxWaitForLoad?: number
  thresholds?: {
    performance?: number
    accessibility?: number
    'best-practices'?: number
    seo?: number
  }
}

export interface BrowserMonitorOptions {
  /**
   * 控制台日志拦截配置
   * 默认情况下不会拦截普通的 console.log 等，只会在开启对应选项时拦截 warn / error
   */
  console?: {
    /** 是否捕获 console.error，默认 true */
    error?: boolean
    /** 是否捕获 console.warn，默认 false */
    warn?: boolean
  }
  /** 全局报错/未捕获异常 */
  window?: {
    /** 是否捕获 window.onerror (未捕获同步异常)，默认 true */
    onerror?: boolean
    /** 是否捕获 unhandledrejection (未捕获 Promise 异常)，默认 true */
    unhandledrejection?: boolean
  }
  /**
   * 网络请求错误监控
   * （未来可以扩展 fetch / xhr 报错监控等）
   */
  network?: {
    /** 是否拦截请求错误 (如 4xx/5xx 或断网)，默认 false */
    error?: boolean
    /** 是否拦截请求超时，默认 false */
    timeout?: boolean
  }
  /** 同类错误防抖缓存时间（秒），默认 120 秒，避免反复请求造成的 token 浪费。期间只从内存拿缓存不再调用 AI */
  cacheExpirySeconds?: number
}

export interface CopilotDevOptions extends LighthouseOptions {
  /** 浏览器终端监控配置 */
  browserMonitor?: boolean | BrowserMonitorOptions
  /**
   * 自定义构建日志过滤函数，返回 false 的警告/报错将被丢弃，不会发送给 AI。
   * 可以用来过滤掉确知的第三方库无用警告，提高信噪比并节省 Token。
   */
  logFilter?: (level: 'warn' | 'error', msg: string) => boolean
}
