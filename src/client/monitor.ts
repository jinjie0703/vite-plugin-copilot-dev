/// <reference types="vite/client" />
// Copilot Dev Client Error Monitor

import { setupConsoleInterceptor } from './interceptors/console'
import { setupWindowInterceptor } from './interceptors/window'
import { setupNetworkInterceptor } from './interceptors/network'

import type { BrowserMonitorOptions } from '../types'

if (import.meta.hot) {
  const ws = import.meta.hot

  // 接收服务端传过来的配置
  // @ts-ignore
  const config: BrowserMonitorOptions = window.__COPILOT_CONFIG__ || {}

  function sendError(type: string, payload: any, msg: string, stack: string) {
    ws.send('copilot:browser-error', { type, payload, msg, stack })
  }

  // 1. 初始化 Console 拦截器 (拦截 console.error / warn)
  setupConsoleInterceptor(config, sendError)

  // 2. 初始化 Window 拦截器 (拦截未捕获的全局异常和 Promise)
  setupWindowInterceptor(config, sendError)

  // 3. 初始化 Network 拦截器 (拦截 Fetch 和 XHR 失败)
  setupNetworkInterceptor(config, sendError)
}
