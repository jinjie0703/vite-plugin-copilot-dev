// MCP Prompt: diagnose_browser_crash
// 将浏览器崩溃日志 + source-map 后的堆栈打包成标准化的诊断 prompt

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getBrowserErrors } from '../context'

export function registerDiagnoseBrowserPrompt(server: McpServer) {
  server.prompt(
    'diagnose_browser_crash',
    'Diagnose browser runtime errors. Automatically collects all intercepted browser errors (console.error, window.onerror, unhandled rejections, network errors) with source-mapped stack traces and code context.',
    {
      language: z.enum(['zh-CN', 'en-US']).default('zh-CN').describe('Response language preference'),
    },
    ({ language }) => {
      const errors = getBrowserErrors()

      const sections: string[] = []

      if (errors.length === 0) {
        sections.push('No browser runtime errors detected.')
      } else {
        sections.push(`## Browser Runtime Errors (${errors.length} total)\n`)

        // 只取最近的 10 条，避免 prompt 过长
        const recent = errors.slice(-10)
        for (let i = 0; i < recent.length; i++) {
          const err = recent[i]
          const time = new Date(err.timestamp).toLocaleTimeString()
          sections.push(`### Error #${i + 1} [${err.type}] at ${time}`)
          sections.push(`**Message:** ${err.message}`)
          if (err.payload && err.payload !== err.message) {
            sections.push(`**Payload:** ${err.payload}`)
          }
          if (err.stack) {
            sections.push(`**Stack Trace:**\n\`\`\`\n${err.stack}\n\`\`\``)
          }
          if (err.codeContext) {
            sections.push(`**Source Code Context (source-mapped):**\n\`\`\`\n${err.codeContext}\n\`\`\``)
          }
          sections.push('')
        }

        if (errors.length > 10) {
          sections.push(`> ...and ${errors.length - 10} more errors omitted.`)
        }
      }

      const langInstruction = language === 'zh-CN'
        ? '请使用中文回复。'
        : 'Please respond in English.'

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `You are a senior frontend debugging expert. The following browser runtime errors were intercepted from the developer's application running on Vite Dev Server. Please:\n\n1. **Identify the root cause** of each error based on the stack trace and source code context\n2. **Provide specific fix suggestions** with code examples where possible\n3. **Group related errors** if they share the same root cause\n\n${langInstruction}\n\n---\n\n${sections.join('\n')}`,
            },
          },
        ],
      }
    }
  )
}
