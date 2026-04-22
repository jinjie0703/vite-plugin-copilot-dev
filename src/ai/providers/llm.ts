// core/llm.ts
import { LLMOptions, Locale, DiagnosticResult } from '../../types'
import { logger } from '../../utils/logger'
import fs from 'fs'
import readline from 'readline'

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
下面是用户 Vite 项目在打包或运行时产生的【控制台日志信息（包含警告或错误）】，以及可能的【代码上下文片段】。
请你分析这些信息，并以结构化的 Markdown 格式输出你的诊断结果和修复补丁（不要使用 JSON）。

结构要求如下：
### 🧠 问题概括
（概括出现的所有核心问题。如果有多个不同类型的警告或错误，请逐一简要列出）

### 💡 修复建议
（清晰、可执行的代码修复建议。请针对上述由于不同原因产生的报错/警告分点作答）

### 🔧 修复补丁
如果你非常确定可以直接通过修改代码来修复问题，请务必按照以下严格格式提供精确的代码替换块：

📁 文件路径: [填入绝对路径，必须从用户提供的上下文中提取]
\`\`\`replace
<<<< SEARCH
[这里严格复制需要被替换的原文件中的多行代码片段，请保留完全一致的空格、缩进和换行。为了保证唯一性，请至少包含目标行上下各2行的上下文！]
====
[这里填写修改后的正确代码]
>>>>
\`\`\`
如果不确定修复代码或不知道绝对路径，请不要输出修复补丁。

请使用 ${language === 'zh-CN' ? '中文' : 'English'} 回复。`

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
