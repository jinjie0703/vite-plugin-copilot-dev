# vite-plugin-copilot-dev

一个专为 Vite 项目设计的性能评估插件。在 `npm run build` 打包完成后，自动在本地利用无头浏览器唤起预览服务，并使用 Google Lighthouse 跑分，最终在打包产物目录（如 `dist`）生成详细的 HTML 可视化性能报告。

## 🌟 核心特性

- **无缝集成**：集成在打包构建的 `closeBundle` 钩子中，构建结束即出报告。
- **自动 AI 错误诊断**：不仅评估性能，当本地项目构建或类型检查报错导致进程崩溃时，可通过拦截器一键调用 LLM 帮你诊断错误根因，并给出具体的 TypeScript/Vite 排错指南。
- **真实场景评估**：默认模拟桌面端后台管理系统的形态（关闭了网络/CPU 节流），还原真实渲染性能。
- **支持自动化登录验证**：通过对接 `puppeteer-core`，可编写自动化测试脚本以突破登录态防线，直接评估需鉴权的内部页面（如仪表盘页面、3D 地图等）。
- **慢资源适配**：支持针对 3D 地图等长加载等待资源的配置时长调整，避免过早中断导致截屏失效。

## 📦 依赖安装

因为该插件依赖 `Lighthouse` 和 `Puppeteer` 来执行无界面浏览器任务，且本身也作为 NPM 包发布，请确保将本插件及相关核心依赖都安装到 `devDependencies` 中：

```bash
npm i -D vite-plugin-copilot-dev lighthouse chrome-launcher puppeteer-core
# 或使用 pnpm
pnpm i -D vite-plugin-copilot-dev lighthouse chrome-launcher puppeteer-core
```

## 🚀 基础使用

在 `vite.config.ts` 中引入本插件，并在 `plugins` 数组中使用。你可以只让它在构建生产代码时触发：

```typescript
import { defineConfig } from 'vite'
import buildPerformancePlugin from './plugins/vite-plugin-copilot-dev'

export default defineConfig(({ command }) => {
  return {
    plugins: [
      // ... 其他插件
      command === 'build' &&
        buildPerformancePlugin({
          outDir: 'dist',
        }),
    ],
  }
})
```

运行 `npm run build` 之后，在控制台会看到一张 100 分制的表格，并在 `dist/lighthouse-report.html` 中生成图文报告。

## 🔐 进阶：如何评估登录后的系统内部页面？

大多数企业级系统入口都有登录拦截，Lighthouse 原生并无穿透能力。本插件暴露了 `onBeforeRun` 钩子，你可以使用传入的 Puppeteer Api 进行前置化的自动输入密码登录动作，亦可直接注入 `localStorage`/`Cookie`：

```typescript
command === 'build' &&
  buildPerformancePlugin({
    outDir: 'dist',
    targetPath: '/#/', // 🔥 你实际想让 Lighthouse 去评测的页面，如内部控制台页
    maxWaitForLoad: 120000, // Lighthouse 最多留给地图 / 资源下载的加载时间 (ms)，默认 90000 (90秒)

    // Puppeteer 在 Lighthouse 执行前做的工作
    async onBeforeRun(browser, page, serverUrl) {
      // 1. 让程序先打开到该项目的登录页
      await page.goto(new URL('/#/login', serverUrl).href, { waitUntil: 'networkidle2' })

      // 2. 根据实际 DOM 的选择器填写账号和密码
      await page.waitForSelector('input[placeholder="请输入账号"]')
      await page.type('input[placeholder="请输入账号"]', 'super_admin')
      await page.type('input[placeholder="请输入密码"]', 'your_password_here')

      // 3. 点击界面的登录按钮并等待跳转完成
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('.login-button'), // 实际的按钮类名或ID
      ])

      // （可选）如果不通过界面输入，也可选择直接把 token 塞进 localStorage 中
      // await page.evaluate(() => {
      //   localStorage.setItem('auth_token', 'xxx-token');
      // });
    },
  })
```

## ⚙️ 类型配置 (Options)

| 参数名           | 类型       | 说明                                                                                                                                           |
| :--------------- | :--------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `outDir`         | `string`   | 指定 Vite 构建产物的路径（需与 `build.outDir` 对应），Lighthouse 生成的 html 也会存入此处。默认为 `"dist"`                                     |
| `targetPath`     | `string`   | 你希望 Lighthouse 具体测量的该项目相对路由路径。默认为基础 URL。例如，如果想要测评首页面，建议填 `"/#/"` (hash 模式) 或 `"/"` (history 模式)。 |
| `maxWaitForLoad` | `number`   | 设置页面完全加载的最大等待毫秒数。对于有很多 3D 模型或依赖异步接口的重型前端项目尤为关键。默认为 `90000` (90秒)。                              |
| `onBeforeRun`    | `Function` | 提供 Puppeteer `browser`, `page` 实例和当前的本地静态服务器根路径 `serverUrl`，便于在真正评估前设定诸如鉴权之类的拦截状态。                    |
| `thresholds`     | `Object`   | 可选配置（备用），你可以借此设置你的最低达标成绩。                                                                                             |
| `language`       | `string`   | AI 输出的语言，可选 `'zh-CN'` (默认) 或 `'en-US'`。                                                                                            |
| `llm`            | `Object`   | AI 大模型配置，用于终端报错或 Vite 构建警告日志的智能诊断（详见下方）。                                                                        |

## 🤖 进阶：如何使用 AI 大模型诊断打包错误？

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
command === 'build' &&
  buildPerformancePlugin({
    outDir: 'dist',
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

1. `lighthouse` 进行测量前通常会清除浏览器缓存，但在有 `onBeforeRun` 后本插件会强制携带 `disableStorageReset: true` 参数，**以防止 Puppeteer 登录写入的凭证在这一刻被 Lighthouse 强行洗掉**。
2. 自动化配置需要准确识别 DOM。如果在自动化过程中卡住，可检查 `vite.config.ts` 里使用的 `class` 和 `id` 选择器是否因重构修改而变化。

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
