import { safeStringify } from '../utils'

type SendErrorFn = (type: string, payload: any, msg: string, stack: string) => void

export function setupConsoleInterceptor(config: any, sendError: SendErrorFn) {
  // Intercept console.error if enabled
  if (config.monitorConsoleError) {
    const originalConsoleError = console.error
    let isSending = false
    console.error = function (...args: any[]) {
      if (isSending) return originalConsoleError.apply(console, args)
      isSending = true
      try {
        const errorStr = args
          .map((arg) => (typeof arg === 'object' ? safeStringify(arg) : String(arg)))
          .join(' ')
        const stack = new Error().stack || ''
        sendError('console.error', errorStr, 'Console Error', stack)
      } catch (e) {
        sendError('console.error', 'Stringify error', 'Console Error', '')
      } finally {
        isSending = false
        originalConsoleError.apply(console, args)
      }
    }
  }

  // Intercept console.warn if enabled
  if (config.monitorConsoleWarn) {
    const originalConsoleWarn = console.warn
    let isSending = false
    console.warn = function (...args: any[]) {
      if (isSending) return originalConsoleWarn.apply(console, args)
      isSending = true
      try {
        const warnStr = args
          .map((arg) => (typeof arg === 'object' ? safeStringify(arg) : String(arg)))
          .join(' ')
        const stack = new Error().stack || ''
        sendError('console.warn', warnStr, 'Console Warning', stack)
      } catch (e) {
        sendError('console.warn', 'Stringify error', 'Console Warning', '')
      } finally {
        isSending = false
        originalConsoleWarn.apply(console, args)
      }
    }
  }
}
