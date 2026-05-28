export function safeStringify(value: any): string {
  if (value instanceof Error) {
    return JSON.stringify({ message: value.message, stack: value.stack, name: value.name })
  }
  const cache = new WeakSet()
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (cache.has(val)) {
          return '[Circular]'
        }
        cache.add(val)
      }
      return val
    })
  } catch (e) {
    return '[Unserializable]'
  }
}
