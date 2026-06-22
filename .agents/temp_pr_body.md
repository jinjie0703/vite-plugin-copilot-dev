## 功能描述
搭建核心底层基础建设，为后续大型重构和稳定迭代铺平道路。

## 核心变动
1. **Zod 运行时校验**：重写了 `CopilotDevOptions` 的类型定义与推导逻辑，使用 Zod 提供严格的配置项解析及默认值自动填充。
2. **测试基建 (Vitest)**：安装并配置 Vitest，首个 TDD 用例验证了配置项的各种边界情况，确保编译期 `hasBuildError` 控制流的稳健性。
3. **拦截器冗余消减 (DRY)**：使用高阶函数工厂 `createInterceptor` 提取了客户端代码（控制台、网络拦截器等）中大量重复的死循环保护 (`isSending`) 和异常捕获逻辑。
4. **ESLint 引入**：引入了现代化的 Flat Config 以及严格的 TypeScript 校验规则，成功揭露项目中超 300 处由 `any` 引起的技术债务，为下阶段修复提供指引。
5. **升级过时的 MCP SDK API**：自动升级所有的 `server.prompt` 到最新的 `server.registerPrompt`。

## 测试方式
- `npm run test` (100% Pass)
- `npm run build` (100% Pass)
- `npm run lint` (配置生效，暴露出大量遗留 warnings 和 errors)
