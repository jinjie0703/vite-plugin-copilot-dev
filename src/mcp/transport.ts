// MCP SSE Transport 适配层
// 将 MCP Server 通过 SSE 协议挂载到 Vite Dev Server 的 HTTP 服务上
// 这样 MCP Client（如 Cursor、Claude Desktop）可以通过 HTTP SSE 连接到本插件

import type { ViteDevServer } from 'vite'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createMcpServer } from './server'
import { logger } from '../utils/logger'

// 活跃的 SSE 会话映射
const activeSessions = new Map<string, SSEServerTransport>()

/**
 * 将 MCP Server 以 SSE 传输方式挂载到 Vite Dev Server 的中间件上。
 *
 * 挂载后的端点：
 * - GET  {basePath}/sse       → 建立 SSE 连接（长连接）
 * - POST {basePath}/messages   → 接收 MCP Client 发来的 JSON-RPC 消息
 *
 * @param viteServer - Vite Dev Server 实例
 * @param basePath - 挂载路径前缀，默认 '/__copilot_mcp'
 */
export function mountMcpTransport(
  viteServer: ViteDevServer,
  basePath: string = '/__copilot_mcp'
) {
  const mcpServer = createMcpServer()
  const ssePath = `${basePath}/sse`
  const messagesPath = `${basePath}/messages`

  // 使用 Vite 的 connect 中间件（基于 node:http）
  viteServer.middlewares.use(async (req, res, next) => {
    const url = req.url || ''

    // ==================== SSE 端点（GET） ====================
    if (req.method === 'GET' && url === ssePath) {
      logger.info('MCP: SSE client connected')

      const transport = new SSEServerTransport(messagesPath, res)
      const sessionId = transport.sessionId
      activeSessions.set(sessionId, transport)

      // 连接断开时清理
      res.on('close', () => {
        activeSessions.delete(sessionId)
        logger.info(`MCP: SSE session ${sessionId} disconnected`)
      })

      // 连接 Transport 到 MCP Server
      try {
        await mcpServer.connect(transport)
      } catch (err) {
        logger.error('MCP: Failed to connect transport', err)
        if (!res.writableEnded) {
          res.end()
        }
      }
      return
    }

    // ==================== Messages 端点（POST） ====================
    if (req.method === 'POST' && url.startsWith(messagesPath)) {
      // 从 URL 中提取 sessionId（SSEServerTransport 会以 query param 形式传递）
      const parsedUrl = new URL(url, `http://${req.headers.host || 'localhost'}`)
      const sessionId = parsedUrl.searchParams.get('sessionId')

      if (!sessionId || !activeSessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid or expired session' }))
        return
      }

      const transport = activeSessions.get(sessionId)!

      // 读取请求体
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })
      req.on('end', async () => {
        try {
          const message = JSON.parse(body)
          await transport.handlePostMessage(req, res, message)
        } catch (err) {
          logger.error('MCP: Failed to handle message', err)
          if (!res.writableEnded) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid JSON' }))
          }
        }
      })
      return
    }

    // 不是 MCP 请求，交给下一个中间件
    next()
  })

  const port = viteServer.config.server?.port || 5173
  const host = typeof viteServer.config.server?.host === 'string'
    ? viteServer.config.server.host
    : 'localhost'

  logger.success(`MCP Server listening at http://${host}:${port}${ssePath}`)
  logger.info(`  → SSE endpoint:      GET  http://${host}:${port}${ssePath}`)
  logger.info(`  → Messages endpoint:  POST http://${host}:${port}${messagesPath}`)
}

/**
 * 关闭所有活跃的 SSE 连接
 */
export function closeMcpTransport() {
  for (const [sessionId, transport] of activeSessions) {
    try {
      transport.close()
    } catch {
      // ignore
    }
    activeSessions.delete(sessionId)
  }
  logger.info('MCP: All SSE sessions closed.')
}
