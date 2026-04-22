// Resources 统一注册入口
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBuildErrorsResource } from './build-errors'
import { registerBrowserErrorsResource } from './browser-errors'
import { registerViteConfigResource } from './vite-config'
import { registerModuleGraphResource } from './module-graph'
import { registerTransformedCodeResource } from './transformed-code'

export function registerAllResources(server: McpServer) {
  registerBuildErrorsResource(server)
  registerBrowserErrorsResource(server)
  registerViteConfigResource(server)
  registerModuleGraphResource(server)
  registerTransformedCodeResource(server)
}
