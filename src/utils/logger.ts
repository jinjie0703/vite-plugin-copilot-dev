// utils/logger.ts
export const logger = {
  info: (msg: string) => console.log('\x1b[36m%s\x1b[0m', `[Copilot-Dev] ${msg}`),
  success: (msg: string) => console.log('\x1b[32m%s\x1b[0m', `[Copilot-Dev] ${msg}`),
  warn: (msg: string, err?: unknown) => {
    console.warn('\x1b[33m%s\x1b[0m', `[Copilot-Dev] ${msg}`)
    if (err) console.warn(err)
  },
  error: (msg: string, err?: unknown) => {
    console.error('\x1b[31m%s\x1b[0m', `[Copilot-Dev] ${msg}`)
    if (err) console.error(err)
  },
  ai: (type: 'diagnose' | 'solution', content: string) => {
    const prefix = type === 'diagnose' ? '🧠 [AI 诊断分析]' : '💡 [AI 修复建议]'
    const color = type === 'diagnose' ? '\x1b[35m%s\x1b[0m' : '\x1b[32m%s\x1b[0m'
    console.log(color, `\n${prefix}\n${content}\n`)
  },
}
