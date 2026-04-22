// core/llm.ts
import { LLMOptions, Locale } from '../../types'
import { logger } from '../../utils/logger'
import fs from 'fs'
import readline from 'readline'
import { RAGSystem } from '../rag'
import { getDiagnosePrompt } from '../prompts'

/**
 * 请求大模型分析控制台收集到的构建警告或错误
 */
export async function analyzeConsoleIssues(
  issues: string[],
  options: LLMOptions,
  language: Locale = 'zh-CN',
  rag?: RAGSystem | null
) {
  if (!options.apiKey || issues.length === 0) {
    return
  }

  logger.info('正在请求 AI 大模型分析构建诊断信息...')

  // 默认使用常见的 OpenAI 兼容配置
  const baseURL = options.baseURL || 'https://api.openai.com/v1'
  const model = options.model || 'gpt-4o' // 默认值

  // 构造系统提示词
  const defaultSystemPrompt = getDiagnosePrompt(language)

  const systemPrompt = options.prompts?.buildIssues || defaultSystemPrompt

  try {
    // 智能截断策略：如果日志条数过多，保留前 15 条和后 15 条，中间省略
    let combinedIssuesText = ''
    if (issues.length > 30) {
      const first15 = issues.slice(0, 15)
      const last15 = issues.slice(-15)
      combinedIssuesText =
        first15.join('\n\n') +
        `\n\n... [省略了中间的 ${issues.length - 30} 条日志以防止文本断层] ...\n\n` +
        last15.join('\n\n')
    } else {
      combinedIssuesText = issues.join('\n\n')
    }

    // 保底阶段限制最大长度防止 Token 超限
    combinedIssuesText = combinedIssuesText.substring(0, 4000)

    // RAG 检索
    let ragContext = ''
    if (rag && issues.length > 0) {
      // 使用第一条或最后一条核心错误消息进行检索
      const query = issues[issues.length - 1].substring(0, 500)
      const results = await rag.retriever.retrieve(query)
      ragContext = rag.retriever.formatResultsForPrompt(results)
    }

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
          { role: 'user', content: combinedIssuesText + (ragContext ? `\n\n${ragContext}` : '') }, // 传入日志和 RAG 上下文
        ],
        stream: true, // 开启流式输出
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`API 响应错误: ${response.status} - ${errText}`)
    }
    if (!response.body) {
      throw new Error('流读取失败，response.body 为空')
    }

    console.log(`\n\x1b[36m🤖 [AI 实时诊断分析开始]\x1b[0m\n`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let fullResponseText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 最后一项可能是不完整的，留到下一个 chunk

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
          try {
            const data = JSON.parse(trimmedLine.substring(6))
            const content = data.choices?.[0]?.delta?.content || ''
            if (content) {
              fullResponseText += content
              process.stdout.write(content)
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
    console.log('\n\x1b[36m----------------------------------------\x1b[0m\n')

    // ========== 尝试解析补丁并 Auto-Apply ==========
    const patchRegex = /📁 文件路径:\s*(.+?)\n[\s\S]*?<<<< SEARCH\n([\s\S]*?)\n====\n([\s\S]*?)\n>>>>/g
    let match
    const patches = []
    while ((match = patchRegex.exec(fullResponseText)) !== null) {
      patches.push({
        filePath: match[1].trim(),
        searchContent: match[2],
        replaceContent: match[3],
      })
    }

    if (patches.length > 0) {
      for (const patch of patches) {
        if (fs.existsSync(patch.filePath)) {
          const content = fs.readFileSync(patch.filePath, 'utf-8')
          
          // 预检防幻觉：统计文中出现了几次需要被替换的代码
          const occurrences = content.split(patch.searchContent).length - 1
          if (occurrences === 0) {
            console.log(`\x1b[31m❌ 自动修复失败：在 ${patch.filePath} 中未找到完全匹配的代码片段 (AI幻觉拦截)。\x1b[0m\n`)
            continue
          } else if (occurrences > 1) {
            console.log(`\x1b[33m⚠️ 自动修复失败：在 ${patch.filePath} 中发现 ${occurrences} 处相同的代码，为防止误伤已停止操作。\x1b[0m\n`)
            continue
          }

          // 确认应用
          const shouldApply = await new Promise<boolean>((resolve) => {
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout
            })
            rl.question(`\x1b[32m✨ AI 已准备好对 ${patch.filePath} 进行代码修复。\n按 [Enter] 自动应用，或输入 N 放弃: \x1b[0m`, (answer) => {
              rl.close()
              resolve(answer.toLowerCase() !== 'n')
            })
          })

          if (shouldApply) {
            const newContent = content.replace(patch.searchContent, patch.replaceContent)
            fs.writeFileSync(patch.filePath, newContent, 'utf-8')
            console.log(`\x1b[32m✅ 已成功修复并覆写文件！(如处于开发环境，HMR 将自动重载)\x1b[0m\n`)
          } else {
            console.log(`\x1b[33m已取消自动应用补丁。\x1b[0m\n`)
          }
        } else {
          console.log(`\x1b[31m❌ 自动修复失败：文件路径不存在 (${patch.filePath})。\x1b[0m\n`)
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      logger.error('获取 AI 诊断结果失败', error.message)
    } else {
      logger.error('获取 AI 诊断结果失败', String(error))
    }
  }
}
