#!/usr/bin/env node
import { spawn } from 'child_process'
import path from 'path'
import dotenv from 'dotenv'
import { loadConfigFromFile, Plugin } from 'vite'

dotenv.config() // 加载环境变量以便读取大模型 API_KEY

// 拿到用户在敲下 `vitex` 后面跟的所有命令，比如 ['npm', 'run', 'build:test']
const [command, ...args] = process.argv.slice(2)

if (!command) {
  console.log('🔴 请提供需要执行的命令，如: vitex npm run build:test')
  process.exit(1)
}

// 终端颜色常量
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  red: '\x1b[31m',
}

console.log(
  `${colors.cyan}🤖 [AI Agent] 正在接管终端并监控执行: ${command} ${args.join(' ')}${colors.reset}\n`
)

const child = spawn(command, args, {
  shell: true,
  stdio: 'pipe',
  // 确保能找到当前项目里的 node_modules 等依赖
  env: { ...process.env, FORCE_COLOR: '1' },
})

let collectedErrorLogs = ''

// 正常打印标准输出
child.stdout.on('data', data => {
  const text = data.toString()

  // 很多编译工具（比如 vue-tsc, tsc, vite）的报错可能输出在 stdout 中
  if (text.toLowerCase().includes('error') || text.includes('ERR_') || text.includes('TS')) {
    collectedErrorLogs += text
  }

  process.stdout.write(data)
})

// 监听标准错误流（收集报错日志）
child.stderr.on('data', data => {
  const text = data.toString()

  // 简单启发式：只有出现可疑的长串报错或 error 关键字才收集，避免把所有的正常进度条文字当成错误
  if (text.toLowerCase().includes('error') || text.includes('ERR_') || text.includes('TS')) {
    collectedErrorLogs += text
  }

  process.stderr.write(text)
})

// 结束时触发诊断
child.on('close', async code => {
  if (code !== 0 && collectedErrorLogs) {
    console.log(`\n${colors.cyan}--------------------------------------------------${colors.reset}`)
    console.log(
      `${colors.magenta}🧠 [AI 侦测到进程崩溃跑挂了] 正在为你诊断控制台报错...${colors.reset}`
    )

    // 首先尝试从 vite 配置文件中读取配置
    let llmConfig = null
    try {
      const res = await loadConfigFromFile({ command: 'build', mode: 'production' })
      if (res && res.config && res.config.plugins) {
        const plugins = Array.isArray(res.config.plugins) ? res.config.plugins.flat(10) : []
        const myPlugin = plugins.find(
          (p): p is Plugin => !!p && (p as Plugin).name === 'vite-plugin-build-performance'
        ) as (Plugin & { api?: { options?: { llm?: Record<string, unknown> } } }) | undefined
        if (myPlugin && myPlugin.api && myPlugin.api.options && myPlugin.api.options.llm) {
          llmConfig = myPlugin.api.options.llm
        }
      }
    } catch {
      // 忽略读取错误
    }

    // 从配置或环境变量中获取
    const apiKey = llmConfig?.apiKey || process.env.MODELSCOPE_API_KEY
    if (!apiKey) {
      console.log(
        `${colors.red}❌ 未在 vite.config.ts 或环境变量发现 MODELSCOPE_API_KEY，跳过 AI 诊断。${colors.reset}`
      )
      console.log(`--------------------------------------------------\n`)
      process.exit(code)
    }

    const baseURL = llmConfig?.baseURL || 'https://api-inference.modelscope.cn/v1'
    const aiModel = llmConfig?.model || 'Qwen/Qwen3-Next-80B-A3B-Instruct'
    const customPrompt = llmConfig?.prompts?.crashDiagnostics
    const fetchUrl = baseURL.endsWith('/chat/completions') ? baseURL : `${baseURL}/chat/completions`

    const systemPrompt =
      customPrompt ||
      `你是一个资深的前端构建与 TypeScript 专家。
用户的进程崩溃了。请分析下面来自终端流中截获的报错信息。并只以 JSON 格式返回你的诊断。

返回格式必须为：
{
  "fileLocation": "指明报错发生的文件相对路径和行列号，例如 src/App.vue:10:5（如果无法确定则填 null）",
  "reason": "指出具体的报错根因（例如缺少某个库、类型未定义等）",
  "suggestion": "给出清晰的解决步骤或代码修复方案"
}`

    try {
      // 动态使用原生的 fetch（Node 18+ 原生支持）
      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: aiModel,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: collectedErrorLogs.substring(0, 3000), // 防止 Token 爆炸
            },
          ],
        }),
      })

      if (!response.ok) throw new Error(`请求失败: ${response.status}`)

      const data = await response.json()
      const resultText = data.choices?.[0]?.message?.content || '{}'

      const cleanJsonText = resultText.replace(/```json\n|\n```|```/g, '').trim()
      const result = JSON.parse(cleanJsonText)

      if (result.fileLocation) {
        console.log(`\n${colors.cyan}📍 [位置]: ${result.fileLocation}${colors.reset}`)
      }
      console.log(
        `${result.fileLocation ? '' : '\n'}${colors.magenta}🧠 [原因]: ${result.reason || '无法提取具体原因'}${colors.reset}`
      )
      console.log(`${colors.green}💡 [建议]: ${result.suggestion || '请检查代码'}${colors.reset}`)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`${colors.red}获取 AI 诊断结果失败: ${errorMessage}${colors.reset}`)
    }

    console.log(`${colors.cyan}--------------------------------------------------${colors.reset}\n`)
  }

  process.exit(code)
})
