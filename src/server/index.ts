import type { ViteDevServer } from 'vite'
import type { CopilotDevOptions } from '../types'
import { setupBrowserErrorHandler } from './handlers/browser-error-handler'
import { interceptBuildErrors } from './handlers/build-error-interceptor'

export function setupServerMonitors(server: ViteDevServer, options: CopilotDevOptions, root: string) {
  // 1. 挂载浏览器报错（运行时）监听器
  setupBrowserErrorHandler(server, options, root)
  // 2. 挂载 Vite 编译报错（构建时）拦截器
  interceptBuildErrors(server, options)
}
