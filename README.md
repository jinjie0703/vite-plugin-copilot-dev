# vite-plugin-copilot-dev

一个专为 Vite 驱动的前端项目设计的 **AI 研发辅助探针与 MCP (Model Context Protocol) 网关**。

将本插件接入你的 Vite 项目后，它能像一个隐形探针一样潜伏在浏览器的运行时中，**实时捕获 Vue/React 组件崩溃、白屏报错、未捕获异常**，并通过 Vite Dev Server 内部的 SourceMap 将这些堆栈精确还原为本地源码上下文。

最重要的是，本插件原生提供了一个标准的 MCP 服务。你可以让你的 AI IDE（如 Cursor、Cline、Claude Desktop 等）直接连上这个网关，让大模型在帮你修 Bug 时拥有“看透浏览器实时报错”的上帝视角！

## 🌟 核心特性

- **极致无感**：只需在 `vite.config.ts` 中挂载，毫无入侵性。
- **运行时报错监控**：精准拦截 `console.error`、`window.onerror`、`unhandledrejection`。
- **SourceMap 还原**：自动将浏览器堆栈解析为绝对路径和精准报错代码行。
- **原生 MCP 网关**：支持 SSE (Server-Sent Events) 与 Stdio 双模通讯，完美兼容当今所有主流 AI Agent/IDE。
- **稳定性保障**：内置全流程 Playwright E2E 测试，通过 Mock 机制与严格的生命周期防抖，彻底消除 Vite 热重启过程中的异步竞态 Bug。
- **零冗余、不越权**：不含任何笨重的 RAG 或本地大模型请求包袱，把最纯粹的运行时状态输送给 IDE 的强大 AI。

## 📦 安装

```bash
npm i -D vite-plugin-copilot-dev
# 或使用 pnpm
pnpm i -D vite-plugin-copilot-dev
```

## 🚀 基础配置 (vite.config.ts)

在 `vite.config.ts` 中引入本插件，并在 `plugins` 数组中使用。

```typescript
import { defineConfig } from 'vite'
import copilotDevPlugin from 'vite-plugin-copilot-dev'

export default defineConfig({
  plugins: [
    copilotDevPlugin({
      // 浏览器终端监控配置
      browserMonitor: {
        console: { error: true, warn: false },
        window: { onerror: true, unhandledrejection: true },
        network: { error: false, timeout: false },
      },
      // MCP 服务配置
      mcp: {
        enabled: true
      }
    }),
  ],
})
```

运行 `npm run dev` 启动 Vite 后，MCP 网关就会自动在后台默默工作。

---

## 🤖 接入 AI IDE (配置 MCP)

要想让 AI 拥有你的报错视野，你需要在你的 AI 工具中将本插件添加为 **MCP Server**。根据你使用的客户端，选择以下任意一种连接方式：

### 方式一：SSE 直连 (推荐 Cursor、Cline 等支持 HTTP 的工具)

如果你的 IDE 或 Agent 支持 `SSE (Server-Sent Events)` 连接方式，建议直接在配置中添加：

- **Type / Protocol**: `SSE`
- **Name**: `Vite-Copilot` (或者随便取)
- **URL**: `http://127.0.0.1:5173/__vite-plugin-copilot-dev-mcp/sse`
*(注：如果你的 Vite 服务不运行在 5173 端口，请将上述 URL 中的端口号改为你实际的端口)*

### 方式二：Stdio 桥接 (推荐 Claude Desktop 或纯 CLI 工具)

如果你的客户端（如 Claude Desktop 或 Antigravity）**只支持通过命令行（stdio）** 启动本地 MCP 服务，本插件自带了一个轻量级桥接脚本。
在你的 MCP 配置文件（如 `mcp_config.json` 或 `claude_desktop_config.json`）中，添加如下完整配置：

```json
{
  "mcpServers": {
    "vite-plugin-copilot-dev-mcp": {
      "command": "node",
      "args": [
        "<你的项目绝对路径>/node_modules/vite-plugin-copilot-dev/mcp_stdio_proxy.mjs",
        "http://127.0.0.1:5173/__vite-plugin-copilot-dev-mcp/sse"
      ]
    }
  }
}
```

*(注意：请将 `<你的项目绝对路径>` 替换为你实际的本地代码工程目录。脚本会自动在标准输入输出和 Vite 服务器的 SSE 接口之间搭建通信桥梁)*

---

一旦配置并连接成功，你就可以在你的 AI 聊天窗口里极其舒适地这样说：
> *"我刚点了一下按钮页面白屏了，调用你的 MCP 看看浏览器里报了什么错，并直接帮我修改代码。"*

AI 会自动读取你当前的浏览器实时报错、自动追踪引发该错误的本地代码上下文，并直接在编辑器里给出修复补丁！

## 📄 协议 (License)

[MIT](https://opensource.org/licenses/MIT)
