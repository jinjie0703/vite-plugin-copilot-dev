// MCP Tool: invalidate_module
// 让 Vite 强制重新加载某个模块（触发 HMR）

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getServer } from '../context'
import { logger } from '../../utils/logger'

export function registerInvalidateModuleTool(server: McpServer) {
  server.tool(
    'invalidate_module',
    'Force Vite to invalidate and reload a specific module, triggering HMR (Hot Module Replacement). Use this when a module is in a stale state or you want to force re-execution of a specific file without a full page reload.',
    {
      filePath: z.string().describe('The file path or URL of the module to invalidate. Can be an absolute path (e.g., /src/App.vue) or a Vite module URL.'),
    },
    async ({ filePath }) => {
      const viteServer = getServer()
      if (!viteServer) {
        return {
          content: [{ type: 'text' as const, text: '❌ Vite Dev Server is not running.' }],
          isError: true,
        }
      }

      try {
        const moduleNode =
          viteServer.moduleGraph.getModuleById(filePath) ||
          (await viteServer.moduleGraph.getModuleByUrl(filePath))

        if (!moduleNode) {
          return {
            content: [{ type: 'text' as const, text: `⚠️ Module not found in Vite module graph: \`${filePath}\`. It may not have been loaded yet.` }],
            isError: true,
          }
        }

        // 使 module 失效
        viteServer.moduleGraph.invalidateModule(moduleNode)

        // 发送 HMR full-reload 通知（如果模块不支持 HMR 则 full reload）
        if (moduleNode.isSelfAccepting) {
          viteServer.ws.send({
            type: 'update',
            updates: [
              {
                type: 'js-update',
                path: moduleNode.url,
                acceptedPath: moduleNode.url,
                timestamp: Date.now(),
              },
            ],
          })
        } else {
          viteServer.ws.send({ type: 'full-reload' })
        }

        logger.info(`MCP: Invalidated module ${moduleNode.file || moduleNode.url}`)

        return {
          content: [{ type: 'text' as const, text: `✅ Module \`${moduleNode.file || moduleNode.url}\` invalidated and HMR triggered.` }],
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('MCP: Failed to invalidate module', err)
        return {
          content: [{ type: 'text' as const, text: `❌ Failed to invalidate module: ${msg}` }],
          isError: true,
        }
      }
    }
  )
}
