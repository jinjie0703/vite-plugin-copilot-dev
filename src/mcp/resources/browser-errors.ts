// MCP Resource: vite://errors/browser
// 暴露从浏览器运行时拦截到的异常信息

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getBrowserErrors } from '../context'

const RESOURCE_URI = 'vite://errors/browser'

export function registerBrowserErrorsResource(server: McpServer) {
  server.resource(
    'browser-errors',
    RESOURCE_URI,
    {
      description: 'Runtime errors intercepted from the browser, including console.error, window.onerror, unhandled promise rejections, and network errors. Each entry contains error type, message, stack trace, and optionally source-mapped code context.',
    },
    async () => {
      const errors = getBrowserErrors()

      if (errors.length === 0) {
        return {
          contents: [
            {
              uri: RESOURCE_URI,
              mimeType: 'text/markdown',
              text: '✅ No browser runtime errors currently.',
            },
          ],
        }
      }

      const lines: string[] = ['## 🌐 Browser Runtime Errors\n']

      for (const err of errors) {
        const time = new Date(err.timestamp).toLocaleTimeString()
        lines.push(`### [${err.type}] at ${time}`)
        lines.push(`**Message:** ${err.message}`)
        if (err.payload) {
          if (err.type === 'network-fetch' || err.type === 'network-xhr') {
            try {
              const parsed = JSON.parse(err.payload)
              lines.push(`**Request Details:**`)
              lines.push(`- **URL:** ${parsed.request.method} ${parsed.request.url}`)
              lines.push(`- **Headers:** \`${JSON.stringify(parsed.request.headers)}\``)
              if (parsed.request.body) {
                lines.push(`- **Payload:**`)
                lines.push('```json\n' + JSON.stringify(parsed.request.body, null, 2) + '\n```')
              }
              lines.push(`\n**Response Details:**`)
              lines.push(`- **Status:** HTTP ${parsed.response.status}`)
              lines.push(`- **Headers:** \`${JSON.stringify(parsed.response.headers)}\``)
              if (parsed.response.body !== null && parsed.response.body !== undefined) {
                lines.push(`- **Body:**`)
                if (typeof parsed.response.body === 'string' && !parsed.response.body.startsWith('{') && !parsed.response.body.startsWith('[')) {
                  lines.push('```\n' + parsed.response.body + '\n```')
                } else {
                  lines.push('```json\n' + JSON.stringify(parsed.response.body, null, 2) + '\n```')
                }
              }
            } catch (e) {
              lines.push(`**Payload:** ${err.payload}`)
            }
          } else {
            lines.push(`**Payload:** ${err.payload}`)
          }
        }
        if (err.stack) {
          lines.push('**Stack Trace:**')
          lines.push('```')
          lines.push(err.stack)
          lines.push('```')
        }
        if (err.codeContext) {
          lines.push('**Source Code Context:**')
          lines.push('```')
          lines.push(err.codeContext)
          lines.push('```')
        }
        lines.push('---')
      }

      return {
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: 'text/markdown',
            text: lines.join('\n'),
          },
        ],
      }
    }
  )
}
