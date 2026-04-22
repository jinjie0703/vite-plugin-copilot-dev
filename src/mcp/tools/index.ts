// Tools 统一注册入口
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerRestartServerTool } from './restart-server'
import { registerClearCacheTool } from './clear-cache'
import { registerInvalidateModuleTool } from './invalidate-module'

export function registerAllTools(server: McpServer) {
  registerRestartServerTool(server)
  registerClearCacheTool(server)
  registerInvalidateModuleTool(server)
}
