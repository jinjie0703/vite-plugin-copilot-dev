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
