// AI 相关的基础类型

export interface LLMPromptOptions {
  /**
   * 用于 Vite 构建过程中控制台警告/报错分析的 Customize Prompt。
   * 建议在 Prompt 中明确要求返回的格式（例如 JSON）。
   */
  buildIssues?: string
}

export interface LLMOptions {
  apiKey: string
  baseURL?: string
  model?: string
  embeddingModel?: string
  maxTokens?: number
  prompts?: LLMPromptOptions
}


// 定义错误诊断报告的数据结构
export interface DiagnosticResult {
  reason: string
  suggestion: string
  codeSnippet?: string
}