// MCP Tool: restart_dev_server
// 重启 Vite Dev Server

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getServer } from '../context'
import { logger } from '../../utils/logger'

export function registerRestartServerTool(server: McpServer) {
  server.tool(
    'restart_dev_server',
    'Restart the Vite Dev Server. Useful when configuration changes are made that require a full restart, or when the server is in a broken state.',
    {},
    async () => {
      const viteServer = getServer()
      if (!viteServer) {
        return {
          content: [{ type: 'text' as const, text: '❌ Vite Dev Server is not running. Cannot restart.' }],
          isError: true,
        }
      }

      try {
        logger.info('MCP: Restarting Vite Dev Server...')
        await viteServer.restart()
        return {
          content: [{ type: 'text' as const, text: '✅ Vite Dev Server restarted successfully.' }],
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('MCP: Failed to restart Vite Dev Server', err)
        return {
          content: [{ type: 'text' as const, text: `❌ Failed to restart: ${msg}` }],
          isError: true,
        }
      }
    }
  )
}
