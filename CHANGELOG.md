# Changelog

## [2.0.1] - 2026-06-22

### ✨ 优化与增强 (Enhancements)

1. **增强的报错上下文展示**：引入 `@babel/code-frame` 和 `stacktrace-parser`，取代了简陋的正则匹配。现在抛给 AI 的错误日志不仅定位更准，还能像真正的终端报错一样高亮显示错误所在的源码片段 (Code Frame)。
2. **主动捕获 Vite 编译错误**：通过底层拦截 `server.ws.send`，现在可以实时捕获热更新 (HMR) 和构建期间的语法编译报错，并无缝同步至大模型。
3. **防止僵尸连接与端口冲突**：新增了对 `server.httpServer` 的 `close` 事件监听，在 Vite 服务器重启或关闭时主动销毁 MCP 通道，彻底解决了残留连接导致的端口占用 Bug。
4. **源码级可读性提升**：为核心的 Vite 生命周期钩子补充了大量详细的设计注释。

## [2.0.0] - 2026-05-28

🎉 **Vite-Copilot 2.0 史诗级架构升级！**

本次更新是一次重大的底层重构。我们将插件从一个“自带笨重 AI 的工具”完全精简为了一个**纯粹、极速、无入侵的 MCP (Model Context Protocol) 基础设施网关**。

### ⚠️ 破坏性更新 (Breaking Changes)

1. **移除 `vitex` CLI 拦截器**：
   - 彻底移除了独立的 `vitex` 命令行包装器。
   - **升级方式**：请停止使用 `vitex npm run dev`，直接回归原生的 `npm run dev` 启动项目即可。
2. **更安全的 MCP 路由机制**：
   - 为防止与其他官方 Copilot 插件发生内部路由冲突，MCP 服务的基准路由（basePath）已全面更新。
   - **升级方式**：请在你的 AI IDE（如 Cursor）中，将 MCP 的连接地址从 `http://127.0.0.1:5173/__copilot_mcp/sse` 更新为 **`http://127.0.0.1:5173/__vite-plugin-copilot-dev-mcp/sse`**。

### ✨ 新特性 (Features)

1. **零冗余、不越权 (Pure MCP)**：
   - 彻底去除了内置的 RAG 系统和 LLM API 依赖。我们将分析错误的任务交还给 IDE（如 Cursor/Cline）中更强大的原生 AI，把插件的运行开销和体积降到了最低。
2. **Stdio 桥接支持转正 (`npx vite-copilot`)**：
   - 针对不支持 HTTP SSE 直连的客户端（如 Claude Desktop 或 Antigravity），官方正式提供 CLI 桥接命令。
   - 只需要在客户端配置中填入 `npx vite-copilot`，即可自动在 `stdio` 和 Vite `SSE` 之间搭建数据通道。
3. **架构解耦与开源就绪**：
   - 重构了底层的代码组织结构（划分了 `Browser Probe`、`Server Assistant`、`State Context` 和 `MCP Gateway` 四大独立模块）。
   - 新增了详尽的 `ARCHITECTURE.md`，欢迎开源社区共建！

### 🐛 修复 (Bug Fixes)

1. **解决多个 IDE 并发连接导致的断连 Bug**：
   - 修复了因为旧版代码中 MCP Server 被误写成单例，导致 IDE 断开重连时出现 `Already connected to a transport` 的致命报错。
2. **修复 Vite 路由 Query 截断 Bug**：
   - 修复了带有 `sessionId` 参数的 POST 消息无法正确路由到底层处理器的 Bug。
3. **消除因 SourceMap 导致 Node.js 崩溃的隐患**：
   - 增加了对空堆栈和非法堆栈字符串的健壮性校验，解决了在某些极端报错下抛出 `Unhandled Promise Rejection` 导致 Vite 进程当场退出的严重问题。
