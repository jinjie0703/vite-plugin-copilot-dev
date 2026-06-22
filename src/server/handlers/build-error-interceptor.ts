import type { ViteDevServer } from "vite";
import type { CopilotDevOptions } from "../../types";
import { pushBuildIssue } from "../../mcp/context";

export function interceptBuildErrors(
  server: ViteDevServer,
  options: CopilotDevOptions,
) {
  // 拦截 Vite 向浏览器发送的编译错误 (语法错误等)
  const originalWsSend = server.ws.send;
  server.ws.send = function (
    this: ViteDevServer['ws'],
    ...args: Parameters<ViteDevServer['ws']['send']>
  ) {
    const payload = args[0]
    
    // 强类型守卫 (Type Guard)
    if (payload && typeof payload === 'object' && 'type' in payload && payload.type === 'error' && 'err' in payload) {
      // 此时推导 payload 为 ErrorPayload (或含有类似结构的类型)
      const errorPayload = payload as import('vite').ErrorPayload
      const err = errorPayload.err
      const msg = `[Vite Compile Error] ${err.message}\nPlugin: ${err.plugin || 'unknown'}\nFile: ${err.id || 'unknown'}\n\n${err.frame || err.stack || ''}`
      
      if (!options.logFilter || options.logFilter('error', msg)) {
        pushBuildIssue('error', msg)
      }
    }

    // 调用原始 send，由于 Function.prototype.apply 的参数重载问题
    // 在严格模式下我们需要借助未知的 Function 强转以保证类型安全边界
    return (originalWsSend as (...args: unknown[]) => void).apply(this, args)
  }
}
