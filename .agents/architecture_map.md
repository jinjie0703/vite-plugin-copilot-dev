# 🗺️ 架构地图 (Architecture Map)

这是 `vite-plugin-copilot-dev` 的核心数据流与架构约定，为后续开发与 AI Vibe Coding 提供绝对的“单点真实”（Single Source of Truth）。

## 核心数据流 (Data Flow)

1. **探针层 (Client Monitor)**:
   - 注入机制：通过 Vite 虚拟模块 `virtual:copilot-dev-client` 注入到浏览器的 `index.html`。
   - 劫持策略：重写 `console.error`，监听 `window.onerror` 和 `unhandledrejection`。
   - 传输机制：使用 Fetch API 将带有 `stack` 的错误日志异步 POST 发送到 Vite Dev Server 的 API 端点（如 `/__copilot/browser_errors`）。

2. **存储层 (Vite Context Singleton)**:
   - 位置：`src/mcp/context.ts`
   - 功能：内存数据库。以全局单例的形式，保存 `activeServer`, `buildErrors`, `browserErrors` 等运行时状态。
   - **防踩坑警报**：Vite 重启(`server.restart()`)时，由于旧 Server 的 `httpServer.on('close')` 是异步触发的，清理上下文时必须对比实例 `if (serverToClear && viteContext.server !== serverToClear) return`，否则会引发**竞态 Bug（Race Condition）**，意外杀死新重启的 Server 实例！

3. **MCP 传输层 (SSE Transport)**:
   - 挂载点：`src/mcp/transport.ts`
   - 机制：利用 Vite `server.middlewares`，暴露 `/sse` 和 `/messages` 接口。
   - 管理：`activeSessions` 映射管理活跃客户端。随 Vite 的启动挂载，随 Vite 的关闭 (`closeMcpTransport`) 卸载（同样需注意多实例并发清理问题）。

4. **MCP 业务层 (Server Tools & Resources)**:
   - **Resources**: 从 `context.ts` 中读取 `browserErrors`, `buildErrors`, `resolvedConfig` 并暴露给大模型。
   - **Tools**: 执行操作（如 `clear_vite_cache`）。涉及到重启 Vite 的操作，在 E2E 测试环境下必须 Mock 掉（因为重启会切断 Playwright 使用的 SSE 连接）。

## E2E 自动化测试策略

- **框架**: Playwright (`playground/e2e/`)
- **原则**: E2E 必须覆盖端到端的闭环（即：触发浏览器错误 -> 网络传输 -> MCP 上下文存储 -> MCP SSE Client 读取断言）。
- **环境变量**: 运行 E2E 时必须注入 `VITE_E2E_TEST=true`，让插件内部的 `restart()` 动作变为 Mock，从而防止连接意外断开导致的 `McpError`。
