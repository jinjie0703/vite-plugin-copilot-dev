// MCP 上下文：Vite 运行时状态的单例容器
// 由 Vite 插件生命周期维护，MCP Server 的 Resources/Tools 从这里读取数据

import type { ViteDevServer } from 'vite'
import type { ViteContext, BuildIssueEntry, BrowserErrorEntry } from '../types'

/** 浏览器错误队列最大长度，防止内存泄漏 */
const MAX_BROWSER_ERRORS = 100
/** 构建日志队列最大长度 */
const MAX_BUILD_ISSUES = 200

/**
 * 全局 Vite 上下文单例。
 * Vite 插件在 configureServer / config / buildEnd 等 hook 中写入数据，
 * MCP Server 的 Resource / Tool handler 从这里读取。
 */
const viteContext: ViteContext = {
  server: null,
  root: process.cwd(),
  buildErrors: [],
  buildWarnings: [],
  browserErrors: [],
}

// ==================== 写入端 API（供 Vite 插件调用） ====================

export function setServer(server: ViteDevServer) {
  viteContext.server = server
  viteContext.root = server.config.root
}

export function clearServer() {
  viteContext.server = null
}

export function pushBuildIssue(level: 'warn' | 'error', message: string) {
  const list = level === 'error' ? viteContext.buildErrors : viteContext.buildWarnings

  // 去重逻辑：如果该日志已经出现过，则只增加计数
  const existing = list.find(i => i.message === message)
  if (existing) {
    existing.count++
    existing.timestamp = Date.now()
  } else {
    list.push({ level, message, count: 1, timestamp: Date.now() })
    // 防止队列无限增长
    if (list.length > MAX_BUILD_ISSUES) list.shift()
  }
}

export function pushBrowserError(entry: Omit<BrowserErrorEntry, 'timestamp'>) {
  viteContext.browserErrors.push({ ...entry, timestamp: Date.now() })
  // 防止队列无限增长
  if (viteContext.browserErrors.length > MAX_BROWSER_ERRORS) {
    viteContext.browserErrors.shift()
  }
}

export function clearBuildIssues() {
  viteContext.buildErrors = []
  viteContext.buildWarnings = []
}

export function clearBrowserErrors() {
  viteContext.browserErrors = []
}

// ==================== 读取端 API（供 MCP handler 调用） ====================

export function getContext(): Readonly<ViteContext> {
  return viteContext
}

export function getServer(): ViteDevServer | null {
  return viteContext.server
}

export function getRoot(): string {
  return viteContext.root
}

export function getBuildErrors(): readonly BuildIssueEntry[] {
  return viteContext.buildErrors
}

export function getBuildWarnings(): readonly BuildIssueEntry[] {
  return viteContext.buildWarnings
}

export function getBrowserErrors(): readonly BrowserErrorEntry[] {
  return viteContext.browserErrors
}
