// core/llm.ts
import { LLMOptions, Locale, DiagnosticResult } from '../types'
import { logger } from '../utils/logger'

/**
 * 请求大模型分析控制台收集到的构建警告或错误
 */
export async function analyzeConsoleIssues(
  issues: string[],
  options: LLMOptions,
  language: Locale = 'zh-CN'
) {
  if (!options.apiKey || issues.length === 0) {
    return
  }

  logger.info('正在请求 AI 大模型分析构建诊断信息...')

  // 默认使用常见的 OpenAI 兼容配置
  const baseURL = options.baseURL || 'https://api.openai.com/v1'
  const model = options.model || 'gpt-4o' // 默认值

  // 构造系统提示词，强制要求它返回 JSON 格式，方便我们结构化提取
  const defaultSystemPrompt = `你是一个资深的前端构建专家（精通 Vite, Rollup, TypeScript, Vue/React）。
下面是用户 Vite 项目在打包时产生的【控制台日志信息（包含警告或错误）】。
请你分析这些信息，并只以 JSON 格式返回你的诊断结果。不准输出其他 Markdown 废话。

要求返回的 JSON 结构必须为：
{
  "reason": "一句话概括核心问题（如果有多个，挑最严重的，比如大 Chunk 未拆分或者模块未找到）",
  "suggestion": "清晰、可执行的代码修复建议。比如如何配置 manualChunks，或修改导入。"
}

请使用 ${language === 'zh-CN' ? '中文' : 'English'} 回复。`

  const systemPrompt = options.prompts?.buildIssues || defaultSystemPrompt

  try {
    // 将所有收集到的日志合并成一段文本交由 AI 分析（限制最大长度防止 Token 超限）
    const combinedIssuesText = issues.join('\n\n').substring(0, 3000)

    const response = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.1, // 降低 temperature 保证输出结构的稳定性
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: combinedIssuesText }, // 传入组装好的控制台日志
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`API 响应错误: ${response.status} - ${errText}`)
    }

    const data = await response.json()
    const resultText = data.choices?.[0]?.message?.content || '{}'

    // 尝试解析模型返回的 JSON（模型有时会带上 ```json 的包裹，清理掉）
    const cleanJsonText = resultText.replace(/```json\n|\n```|```/g, '').trim()
    const result: DiagnosticResult = JSON.parse(cleanJsonText)

    if (result.reason || result.suggestion) {
      logger.ai('diagnose', result.reason || 'AI 无法提取具体原因')
      logger.ai('solution', result.suggestion || '请检查常规配置。')
    }
  } catch (error) {
    if (error instanceof Error) {
      logger.error('获取 AI 诊断结果失败', error.message)
    } else {
      logger.error('获取 AI 诊断结果失败', String(error))
    }
  }
}
