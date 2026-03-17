// plugins/vite-plugin-build-performance/index.ts
import { Plugin, createLogger } from 'vite'
import type { LighthouseOptions } from './types'
import { runLighthouseAnalysis } from './core/lighthouse'
import { analyzeConsoleIssues } from './core/llm'

export default function vitePluginBuildPerformance(options: LighthouseOptions = {}): Plugin {
  let hasBuildError = false
  const collectedIssues: string[] = []

  return {
    name: 'vite-plugin-build-performance',
    api: { options }, // 导出 options 给外部读取
    // Only run this plugin during the build command
    apply: 'build',

    // 配置早期拦截：劫持并收集 Vite 的警告和报错日志
    config(userConfig) {
      const customLogger = userConfig.customLogger || createLogger()
      const originalWarn = customLogger.warn
      const originalError = customLogger.error

      customLogger.warn = (msg, opts) => {
        // 收集我们关心的警告（例如超过 500kb 的文件体积警告等）
        if (
          msg.includes('larger than') ||
          msg.includes('Consider') ||
          msg.includes('Use build.rollupOptions')
        ) {
          collectedIssues.push('WARNING: ' + msg)
        }
        originalWarn(msg, opts)
      }

      customLogger.error = (msg, opts) => {
        collectedIssues.push('ERROR: ' + msg)
        originalError(msg, opts)
      }

      userConfig.customLogger = customLogger
    },

    // 监听构建结束：如果抛出了致死错误，立马进行 AI 请求
    async buildEnd(error) {
      if (error) {
        hasBuildError = true
        collectedIssues.push('FATAL ERROR: ' + error.message + '\n' + (error.stack || ''))
        // 这一步虽然依然会在 Vite 最后抛出堆栈前，但好处是能抓到 Rollup 层面无法挽回的崩溃
        await analyzeConsoleIssues(collectedIssues, options.llm || { apiKey: '' }, options.language)
      }
    },

    // The closeBundle hook runs after Vite has finished processing the build
    async closeBundle() {
      // 成功构建的话，依然可能遗留刚才拦截到的超大 Chunk 拆包警告，送给 AI 分析！
      if (!hasBuildError && collectedIssues.length > 0) {
        await analyzeConsoleIssues(collectedIssues, options.llm || { apiKey: '' }, options.language)
      }

      if (hasBuildError) {
        return
      }
      await runLighthouseAnalysis(options)
    },
  }
}
