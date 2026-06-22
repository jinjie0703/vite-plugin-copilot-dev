export function safeStringify(value: any): string {
  const seen = new WeakSet()
  return JSON.stringify(value, (key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        return '[Circular]'
      }
      seen.add(val)
    }
    // Handle Error objects
    if (val instanceof Error) {
      return {
        message: val.message,
        name: val.name,
        stack: val.stack
      }
    }
    // Handle specific HTML elements
    if (val instanceof HTMLElement) {
      return `<${val.tagName.toLowerCase()}${val.id ? ` id="${val.id}"` : ''}${
        val.className ? ` class="${val.className}"` : ''
      }>`
    }
    return val
  })
}

/**
 * 创建防死循环的高阶拦截器函数
 * 自动处理 isSending 标志，防止在序列化或发送错误时再次触发原方法导致栈溢出
 */
export function createInterceptor<T extends (...args: any[]) => void>(
  originalFn: T,
  interceptorLogic: (...args: Parameters<T>) => void
): (...args: Parameters<T>) => void {
  let isSending = false
  return function (this: any, ...args: Parameters<T>) {
    if (isSending) return originalFn.apply(this, args)
    
    isSending = true
    try {
      interceptorLogic.apply(this, args)
    } finally {
      isSending = false
      originalFn.apply(this, args)
    }
  }
}
