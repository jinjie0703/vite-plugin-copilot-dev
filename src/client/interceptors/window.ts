import type { BrowserMonitorOptions } from '../../types'

type SendErrorFn = (type: string, payload: any, msg: string, stack: string) => void

/**
 * 设置全局窗口错误拦截器 (window.onerror, window.onunhandledrejection)
 */
export function setupWindowInterceptor(config: BrowserMonitorOptions, sendError: SendErrorFn) {
  // Intercept global uncaught errors if enabled
  if (config.window?.onerror) {
    window.addEventListener('error', (event) => {
      const { message, filename, lineno, colno, error } = event
      const stack = error?.stack || `at ${filename}:${lineno}:${colno}`
      sendError('window.onerror', message, 'Uncaught Exception', stack)
    })
  }

  // Intercept unhandled promise rejections if enabled
  if (config.window?.unhandledrejection) {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason
      const msg = typeof reason === 'string' ? reason : reason?.message || 'Unhandled Rejection'
      const stack = reason?.stack || ''
      sendError('unhandledrejection', msg, 'Unhandled Promise Rejection', stack)
    })
  }
}
