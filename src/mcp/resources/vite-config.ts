// MCP Resource: vite://config/resolved
// 暴露 Vite 解析后的完整配置（运行时实际生效的配置，不是源码）

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getServer } from '../context'

const RESOURCE_URI = 'vite://config/resolved'

export function registerViteConfigResource(server: McpServer) {
  server.resource(
    'vite-config',
    RESOURCE_URI,
    {
      description: 'The fully resolved Vite configuration at runtime, including merged defaults, plugin list, resolve aliases, build options, and server options. This is the actual effective config, not the source file.',
    },
    async () => {
      const viteServer = getServer()

      if (!viteServer) {
        return {
          contents: [
            {
              uri: RESOURCE_URI,
              mimeType: 'text/markdown',
              text: '⚠️ Vite Dev Server is not running. Config is unavailable.',
            },
          ],
        }
      }

      const config = viteServer.config

      // 提取关键配置信息，避免序列化循环引用和过大的对象
      const safeConfig = {
        root: config.root,
        base: config.base,
        mode: config.mode,
        command: config.command,
        resolve: {
          alias: config.resolve?.alias,
          extensions: config.resolve?.extensions,
          conditions: config.resolve?.conditions,
        },
        server: {
          host: config.server?.host,
          port: config.server?.port,
          strictPort: config.server?.strictPort,
          https: !!config.server?.https,
          proxy: config.server?.proxy ? Object.keys(config.server.proxy) : [],
          cors: config.server?.cors,
        },
        build: {
          target: config.build?.target,
          outDir: config.build?.outDir,
          assetsDir: config.build?.assetsDir,
          minify: config.build?.minify,
          sourcemap: config.build?.sourcemap,
          cssMinify: config.build?.cssMinify,
          rollupOptions: config.build?.rollupOptions
            ? { external: (config.build.rollupOptions as any).external }
            : undefined,
        },
        plugins: (config.plugins || []).map(p => ({
          name: (p as any)?.name || 'unnamed',
        })),
        css: {
          preprocessorOptions: config.css?.preprocessorOptions
            ? Object.keys(config.css.preprocessorOptions)
            : [],
        },
        envPrefix: config.envPrefix,
        define: config.define,
      }

      return {
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: 'application/json',
            text: JSON.stringify(safeConfig, null, 2),
          },
        ],
      }
    }
  )
}
