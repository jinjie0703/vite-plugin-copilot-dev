// MCP Resource Template: vite://module-graph/{filePath}
// 暴露 Vite 内部的模块依赖图信息（只有正在运行的 Vite Dev Server 才有）

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getServer } from '../context'

export function registerModuleGraphResource(server: McpServer) {
  server.resource(
    'module-graph',
    new ResourceTemplate('vite://module-graph/{filePath}', {
      list: async () => {
        const viteServer = getServer()
        if (!viteServer) return { resources: [] }

        // 列出当前模块图中所有已加载模块
        const modules = Array.from(viteServer.moduleGraph.idToModuleMap.values())
        return {
          resources: modules
            .filter(m => m.file)
            .slice(0, 50) // 限制返回数量
            .map(m => ({
              uri: `vite://module-graph/${encodeURIComponent(m.file!)}`,
              name: m.file!,
              description: `Module dependency info for ${m.file}`,
            })),
        }
      },
    }),
    {
      description: 'Vite internal module dependency graph for a specific file. Shows importers (who imports this module) and imported modules (what this module imports). Only available when Vite Dev Server is running.',
    },
    async (uri, { filePath }) => {
      const viteServer = getServer()
      if (!viteServer) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: '⚠️ Vite Dev Server is not running.',
            },
          ],
        }
      }

      const decodedPath = decodeURIComponent(filePath as string)

      // 尝试从模块图中找到该模块
      const moduleNode =
        viteServer.moduleGraph.getModuleById(decodedPath) ||
        (await viteServer.moduleGraph.getModuleByUrl(decodedPath))

      if (!moduleNode) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: `⚠️ Module not found in Vite module graph: ${decodedPath}`,
            },
          ],
        }
      }

      const importers = Array.from(moduleNode.importers || []).map(m => m.file || m.url)
      const imported = Array.from(moduleNode.importedModules || []).map(m => m.file || m.url)

      const info = {
        file: moduleNode.file,
        url: moduleNode.url,
        type: moduleNode.type,
        lastHMRTimestamp: moduleNode.lastHMRTimestamp,
        importers,
        importedModules: imported,
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(info, null, 2),
          },
        ],
      }
    }
  )
}
