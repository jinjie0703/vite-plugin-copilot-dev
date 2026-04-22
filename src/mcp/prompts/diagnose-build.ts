// MCP Prompt: diagnose_build_error
// 将当前构建报错 + Vite 配置打包成标准化的诊断 prompt

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getBuildErrors, getBuildWarnings, getServer } from '../context'

export function registerDiagnoseBuildPrompt(server: McpServer) {
  server.prompt(
    'diagnose_build_error',
    'Diagnose current Vite build errors and warnings. Automatically collects all build issues, resolved Vite config, and plugin list into a structured diagnostic prompt for the LLM.',
    {
      language: z.enum(['zh-CN', 'en-US']).default('zh-CN').describe('Response language preference'),
    },
    ({ language }) => {
      const errors = getBuildErrors()
      const warnings = getBuildWarnings()
      const viteServer = getServer()

      const sections: string[] = []

      // 构建错误
      if (errors.length > 0) {
        sections.push('## Build Errors')
        for (const e of errors) {
          const countSuffix = e.count > 1 ? ` (occurred ${e.count} times)` : ''
          sections.push(`- [ERROR]${countSuffix} ${e.message}`)
        }
      }

      // 构建警告
      if (warnings.length > 0) {
        sections.push('\n## Build Warnings')
        for (const w of warnings) {
          const countSuffix = w.count > 1 ? ` (occurred ${w.count} times)` : ''
          sections.push(`- [WARN]${countSuffix} ${w.message}`)
        }
      }

      if (errors.length === 0 && warnings.length === 0) {
        sections.push('No build errors or warnings detected.')
      }

      // Vite 配置概要
      if (viteServer) {
        const config = viteServer.config
        sections.push('\n## Vite Environment')
        sections.push(`- **Root**: ${config.root}`)
        sections.push(`- **Mode**: ${config.mode}`)
        sections.push(`- **Plugins**: ${(config.plugins || []).map(p => (p as any).name).join(', ')}`)
        if (config.build?.target) {
          sections.push(`- **Build Target**: ${config.build.target}`)
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
              text: `You are a senior frontend build expert (Vite, Rollup, TypeScript, Vue/React). Please analyze the following Vite build issues and provide:\n\n1. **Root Cause Analysis** - What's causing each error/warning\n2. **Fix Suggestions** - Clear, actionable steps to resolve them\n3. **Prevention Tips** - How to avoid similar issues in the future\n\n${langInstruction}\n\n---\n\n${sections.join('\n')}`,
            },
          },
        ],
      }
    }
  )
}
