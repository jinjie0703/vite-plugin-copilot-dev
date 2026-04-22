// MCP Server 核心：创建并配置 McpServer 实例
// 注册所有 Resources、Tools、Prompts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAllResources } from './resources'
import { registerAllTools } from './tools'
import { registerAllPrompts } from './prompts'
import { logger } from '../utils/logger'

let mcpServerInstance: McpServer | null = null

/**
 * 创建并返回配置好的 MCP Server 实例（单例）。
 * 调用者需要自行连接 Transport。
 */
export function createMcpServer(): McpServer {
  if (mcpServerInstance) {
    return mcpServerInstance
  }

  const server = new McpServer({
    name: 'vite-copilot-dev',
    version: '1.0.0',
  })

  // 注册所有能力
  registerAllResources(server)
  registerAllTools(server)
  registerAllPrompts(server)

  logger.info('MCP Server created — registered resources, tools, prompts.')

  mcpServerInstance = server
  return server
}

export function getMcpServer(): McpServer | null {
  return mcpServerInstance
}