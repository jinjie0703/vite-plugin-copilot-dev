# vite-plugin-copilot-dev

一个专为 Vite 项目设计的 AI 研发辅助插件 (Copilot)。它可以接管你的终端进程监控构建崩溃，自动拦截 Vite 和浏览器的报错，并通过调用大语言模型（LLM）帮你自动分析问题根因、甚至一键修改源码。

## 🌟 核心特性

- **无缝集成**：只需要在 Vite 配置文件中简单引入即可开启。
- **浏览器运行时报错监控**：开发环境自动拦截页面的 `console.error`、未捕获异常或请求失败，并将这些崩溃堆栈、SourceMap 和模块依赖图暴露给 MCP Server。
- **MCP 上下文网关**：内置标准化模型上下文协议 (Model Context Protocol) 服务，支持 Cursor、Claude Desktop 等现代 AI 工具直接读取当前开发环境中的报错与状态，实现“边看报错边修 Bug”的自动化体验。

## 📦 依赖安装

请确保将本插件安装到 `devDependencies` 中：

```bash
npm i -D vite-plugin-copilot-dev
# 或使用 pnpm
pnpm i -D vite-plugin-copilot-dev
```

## 🚀 基础使用与类型配置 (Options)

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

## ⚠️ 注意事项

1. 本插件依赖构建缓存与网络请求拦截，确保在 `development` 模式下启用。

## 🛠 本地二次开发与构建

本插件全面拥抱 TypeScript，并使用 `tsup` 进行打包。如果你希望 Fork 或者在本地进行项目的二次开发：

1. 克隆代码并安装开发依赖（如 `tsup`、`typescript` 等）。
2. 在插件目录下运行监听模式：

   ```bash
   npm run dev
   ```

3. 修改 `src/` 下的源码即可实时增量编译到 `dist/`，主项目中再次运行构建时即可立马生效。
4. 开发完成后，如果需要发布上架或最终打包压缩，只需执行：

   ```bash
   npm run build
   ```

## 📄 测试与协议 (License)

本项目基于 [MIT](https://opensource.org/licenses/MIT) 协议开源。
你可以自由使用、修改或分发本项目的原代码（无论是否商用），但请保留版权许可声明。
