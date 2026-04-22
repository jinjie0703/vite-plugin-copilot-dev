// MCP Resource: vite://errors/build
// 暴露当前 Vite 构建过程中收集到的编译错误和警告

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getBuildErrors, getBuildWarnings } from '../context'

const RESOURCE_URI = 'vite://errors/build'

export function registerBuildErrorsResource(server: McpServer) {
  server.resource(
    'build-errors',
    RESOURCE_URI,
    {
      description: 'Current Vite build/compile errors and warnings collected during the build process. Includes error messages, severity levels, occurrence counts, and timestamps.',
    },
    async () => {
      const errors = getBuildErrors()
      const warnings = getBuildWarnings()

      const sections: string[] = []

      if (errors.length > 0) {
        sections.push('## ❌ Build Errors\n')
        for (const e of errors) {
          const countSuffix = e.count > 1 ? ` (×${e.count})` : ''
          sections.push(`- **[ERROR]**${countSuffix} ${e.message}`)
        }
      }

      if (warnings.length > 0) {
        sections.push('\n## ⚠️ Build Warnings\n')
        for (const w of warnings) {
          const countSuffix = w.count > 1 ? ` (×${w.count})` : ''
          sections.push(`- **[WARN]**${countSuffix} ${w.message}`)
        }
      }

      if (sections.length === 0) {
        sections.push('✅ No build errors or warnings currently.')
      }

      return {
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: 'text/markdown',
            text: sections.join('\n'),
          },
        ],
      }
    }
  )
}
