import { safeStringify, createInterceptor } from '../utils'
import type { BrowserMonitorOptions } from '../../types'

type SendErrorFn = (type: string, payload: any, msg: string, stack: string) => void

/**
 * 设置控制台相关的监控拦截器 (console.error, console.warn)
 */
export function setupConsoleInterceptor(config: BrowserMonitorOptions, sendError: SendErrorFn) {
  // Intercept console.error if enabled
  if (config.console?.error) {
    console.error = createInterceptor(console.error, (...args: any[]) => {
      try {
        const errorStr = args
          .map((arg) => (typeof arg === 'object' ? safeStringify(arg) : String(arg)))
          .join(' ')
        const stack = new Error().stack || ''
        sendError('console.error', errorStr, 'Console Error', stack)
      } catch (e) {
        sendError('console.error', 'Stringify error', 'Console Error', '')
      }
    })
  }

  // Intercept console.warn if enabled
  if (config.console?.warn) {
    console.warn = createInterceptor(console.warn, (...args: any[]) => {
      try {
        const warnStr = args
          .map((arg) => (typeof arg === 'object' ? safeStringify(arg) : String(arg)))
          .join(' ')
        const stack = new Error().stack || ''
        sendError('console.warn', warnStr, 'Console Warning', stack)
      } catch (e) {
        sendError('console.warn', 'Stringify error', 'Console Warning', '')
      }
    })
  }
}
