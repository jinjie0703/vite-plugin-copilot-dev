// 1. 定义常见的敏感键名正则（忽略大小写）
const SENSITIVE_KEYS_REGEX = /(password|passwd|secret|token|authorization|auth|cookie|jwt|apikey)$/i

// 2. 常见敏感内容的正则替换规则
const CONTENT_RULES = [
  // 匹配常见的 Bearer Token
  {
    pattern: /Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
    replace: 'Bearer ***REDACTED_TOKEN***',
  },
  // 匹配手机号 (简单规则)
  { pattern: /1[3-9]\d{9}/g, replace: '***REDACTED_PHONE***' },
  // 匹配邮箱
  { pattern: /[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+/g, replace: '***REDACTED_EMAIL***' },
]

/**
 * 深度遍历对象进行脱敏和降噪
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function desensitizePayload(payload: any, depth = 0): any {
  // 降噪：防止对象层级过深或环引用
  if (depth > 5) return '[Object too deep]'
  if (!payload) return payload

  if (typeof payload === 'string') {
    // 降噪：截断超长字符串
    let str = payload
    if (str.length > 2000) {
      str = str.substring(0, 2000) + '...[TRUNCATED_LENGTH]'
    }
    // 脱敏：内容正则替换
    CONTENT_RULES.forEach(rule => {
      str = str.replace(rule.pattern, rule.replace)
    })
    return str
  }

  if (Array.isArray(payload)) {
    // 降噪：保留数组前5项，其余截断
    const sliced = payload.slice(0, 5).map(item => desensitizePayload(item, depth + 1))
    if (payload.length > 5) sliced.push(`...[${payload.length - 5} MORE ITEMS TRUNCATED]`)
    return sliced
  }

  if (typeof payload === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = {}
    for (const key of Object.keys(payload)) {
      // 脱敏：如果键名命中敏感词，掩码其值
      if (SENSITIVE_KEYS_REGEX.test(key)) {
        result[key] = '***REDACTED***'
      } else {
        result[key] = desensitizePayload(payload[key], depth + 1)
      }
    }
    return result
  }

  return payload
}
