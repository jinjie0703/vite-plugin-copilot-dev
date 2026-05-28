// MCP Server 核心：创建并配置 McpServer 实例
// 注册所有 Resources、Tools、Prompts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAllResources } from './resources'
import { registerAllTools } from './tools'
import { registerAllPrompts } from './prompts'

/**
 * 创建并返回配置好的 MCP Server 实例。
 * 每个 SSE 客户端连接都需要一个独立的实例。
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'vite-copilot-dev',
    version: '1.0.0',
  })

  // 注册所有能力
  registerAllResources(server)
  registerAllTools(server)
  registerAllPrompts(server)

  return server
}