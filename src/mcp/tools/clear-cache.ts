// MCP Tool: clear_vite_cache
// 清除 Vite 缓存目录（node_modules/.vite）并重启 Dev Server

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getServer, getRoot } from '../context'
import { logger } from '../../utils/logger'
import fs from 'fs'
import path from 'path'

export function registerClearCacheTool(server: McpServer) {
  server.tool(
    'clear_vite_cache',
    'Clear the Vite dependency pre-bundling cache (node_modules/.vite directory) and restart the Dev Server. Use this when you suspect stale cache is causing issues, e.g., after manually editing node_modules or switching branches.',
    {},
    async () => {
      const viteServer = getServer()
      const root = getRoot()

      // 定位缓存目录
      const cacheDir = viteServer?.config.cacheDir || path.resolve(root, 'node_modules/.vite')

      try {
        if (fs.existsSync(cacheDir)) {
          fs.rmSync(cacheDir, { recursive: true, force: true })
          logger.info(`MCP: Cleared Vite cache at ${cacheDir}`)
        } else {
          logger.info('MCP: Vite cache directory does not exist, skipping.')
        }

        // 如果 Dev Server 在运行，重启它
        if (viteServer) {
          await viteServer.restart()
          return {
            content: [{ type: 'text' as const, text: `✅ Cleared cache at \`${cacheDir}\` and restarted Vite Dev Server.` }],
          }
        }

        return {
          content: [{ type: 'text' as const, text: `✅ Cleared cache at \`${cacheDir}\`. Dev Server is not running, no restart needed.` }],
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('MCP: Failed to clear Vite cache', err)
        return {
          content: [{ type: 'text' as const, text: `❌ Failed to clear cache: ${msg}` }],
          isError: true,
        }
      }
    }
  )
}
