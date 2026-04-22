// MCP Resource Template: vite://transform/{filePath}
// 暴露文件经过 Vite 插件管线转换后的代码（和源码可能差异很大）

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getServer } from '../context'

export function registerTransformedCodeResource(server: McpServer) {
  server.resource(
    'transformed-code',
    new ResourceTemplate('vite://transform/{filePath}', {
      list: undefined, // 按需查询，不主动列举
    }),
    {
      description: 'The transformed/compiled code of a file after passing through Vite\'s plugin pipeline. This shows what Vite actually serves to the browser, which can be very different from the original source code (e.g., Vue SFC compilation, JSX transform, TypeScript compilation).',
    },
    async (uri, { filePath }) => {
      const viteServer = getServer()
      if (!viteServer) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: '⚠️ Vite Dev Server is not running.',
            },
          ],
        }
      }

      const decodedPath = decodeURIComponent(filePath as string)

      // 尝试从模块图中获取已缓存的转换结果
      const moduleNode =
        viteServer.moduleGraph.getModuleById(decodedPath) ||
        (await viteServer.moduleGraph.getModuleByUrl(decodedPath))

      if (!moduleNode?.transformResult) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `⚠️ No cached transform result for: ${decodedPath}\nThe file may not have been loaded yet, or Vite hasn't processed it.`,
            },
          ],
        }
      }

      const result = moduleNode.transformResult

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/javascript',
            text: result.code,
          },
        ],
      }
    }
  )
}
