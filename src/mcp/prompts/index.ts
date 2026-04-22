// Prompts 统一注册入口
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDiagnoseBuildPrompt } from './diagnose-build'
import { registerDiagnoseBrowserPrompt } from './diagnose-browser'

export function registerAllPrompts(server: McpServer) {
  registerDiagnoseBuildPrompt(server)
  registerDiagnoseBrowserPrompt(server)
}
