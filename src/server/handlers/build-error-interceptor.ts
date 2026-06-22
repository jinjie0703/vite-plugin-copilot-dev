import type { ViteDevServer } from "vite";
import type { CopilotDevOptions } from "../../types";
import { pushBuildIssue } from "../../mcp/context";

export function interceptBuildErrors(
  server: ViteDevServer,
  options: CopilotDevOptions,
) {
  // 拦截 Vite 向浏览器发送的编译错误 (语法错误等)
  const originalWsSend = server.ws.send;
  server.ws.send = ((payload: any, ...rest: any[]) => {
    if (
      payload &&
      typeof payload === "object" &&
      payload.type === "error" &&
      payload.err
    ) {
      const err = payload.err;
      const msg = `[Vite Compile Error] ${err.message}\nPlugin: ${err.plugin || "unknown"}\nFile: ${err.id || "unknown"}\n\n${err.frame || err.stack || ""}`;
      if (!options.logFilter || options.logFilter("error", msg)) {
        pushBuildIssue("error", msg);
      }
    }
    // 使用 server.ws 替代 this，避免 TS 报错
    originalWsSend.apply(server.ws, [payload, ...rest] as any);
  }) as any;
}
