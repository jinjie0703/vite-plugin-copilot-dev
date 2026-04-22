# vite-plugin-copilot-dev

一个专为 Vite 项目设计的 AI 研发辅助插件 (Copilot)。它可以接管你的终端进程监控构建崩溃，自动拦截 Vite 和浏览器的报错，并通过调用大语言模型（LLM）帮你自动分析问题根因、甚至一键修改源码。

## 🌟 核心特性

- **无缝集成**：只需要在 Vite 配置文件中简单引入即可开启。
- **构建崩溃拦截**：使用内置的 `vitex` 命令包装原有的打包命令，当 `vue-tsc` 或 Vite 挂掉时，自动询问是否召唤 AI 进行上下文诊断。
- **浏览器运行时报错监控**：开发环境自动拦截页面的 `console.error`、未捕获异常或请求失败，并在终端弹出 AI 诊断窗口。
- **智能代码补丁**：LLM 给出修复建议后，可在终端直接按回车将修复代码打回本地源码文件。

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
      language: 'zh-CN', // AI 输出的语言，可选 'zh-CN' 或 'en-US'
      llm: {
        apiKey: process.env.MODELSCOPE_API_KEY || 'your-api-key',
        baseURL: 'https://api-inference.modelscope.cn/v1',
        model: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
      },
      // 浏览器终端监控配置
      browserMonitor: {
        console: { error: true, warn: false },
        window: { onerror: true, unhandledrejection: true },
        network: { error: false, timeout: false },
      }
    }),
  ],
})
```

## 🤖 进阶：如何拦截终端打包崩溃？

我们在打包重型前端项目时，经常遇到 Vite 拆包警告，或 Vue-TSC 类型检查炸出一堆错。本插件自带一个增强拦截器。

### 1. 替换 package.json 中的打包命令

使用插件内置的命令转发器 `vitex`（内部指向 `ai-runner.js`），自动搜集标准输出和标准错误的报错：

```json
{
  "scripts": {
    // 之前通常是这样：
    // "build": "run-p type-check build-only"

    // 改造后，在最前面加上 vitex 即可：
    "build": "vitex run-p type-check build-only"
  }
}
```

> **💡 提示**：如果你是在 Monorepo 中（未通过 npm install 而是直接放本地 `plugins/` 下使用本插件），由于并没有自动注册 bin，`vitex` 命令可能无法识别。此时你可以直接用 node 执行编译后的 runner 文件：
> `"build": "node plugins/vite-plugin-copilot-dev/dist/bin/ai-runner.js run-p type-check build-only"`

### 2. 在 vite.config.ts 增加 LLM 配置项

您可以配置任意兼容 OpenAI 接口格式的提供商（如阿里百炼 / DeepSeek 等），甚至**可以完全自定义输入给 AI 模型的 Prompt**。如果没有在此处配置 `apiKey`，插件会尝试去项目根目录的 `.env` 中读取 `MODELSCOPE_API_KEY`。

```typescript
import copilotDevPlugin from 'vite-plugin-copilot-dev'

// 在 plugins 数组中加入：
copilotDevPlugin({
  language: 'zh-CN',
  llm: {
    apiKey: process.env.MODELSCOPE_API_KEY || 'ms-your-api-key', // 设置你的 ApiKey
    baseURL: 'https://api-inference.modelscope.cn/v1', // 兼容 OpenAI 的聚合大模型接口
    model: 'Qwen/Qwen3-Next-80B-A3B-Instruct', // 选择适合的模型

    // 【可选】自定义 AI 的指导提示词 (Prompts)
    prompts: {
      // 针对 Vite 构建过程中抛出的大 Chunk 警告或 rollup 报错，让 AI 返回解答：
      buildIssues: `你是一个严格的性能架构师。
这是 Vite 的打包警告日志。请务必只返回 JSON 格式: 
{ "reason": "概括问题", "suggestion": "代码修改建议或配置指导" }`,

      // 针对终端进程崩溃（如 TS 类型检查挂了、缺少 npm 包）的报错，让 AI 返回解答：
      crashDiagnostics: `你是高级 TypeScript 专家。
用户的进程崩溃了。请分析以下报错并告诉我修复手段。记得必须返回 JSON 格式：
{ "reason": "根本原因说明", "suggestion": "解决思路，如补充声明" }`,
    },
  },
})
```

## ⚠️ 注意事项

1. 本插件依赖终端标准输出捕获，如果在 Windows 上出现乱码，请检查终端编码。
2. 自动打补丁功能会直接修改源文件，建议在 Git 环境下使用，以便随时回退错误修改。

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
