// Vite 生命周期交互的类型

import type { z } from 'zod'
import type { McpServerOptions } from './mcp'
import type { BrowserMonitorOptionsSchema, CopilotDevOptionsSchema } from './schema'

export type BrowserMonitorOptions = z.infer<typeof BrowserMonitorOptionsSchema>

export type CopilotDevOptions = z.infer<typeof CopilotDevOptionsSchema> & {
  // Override inferred function types which are `any` in Zod
  logFilter?: (level: 'warn' | 'error', msg: string) => boolean
  browserMonitor?: boolean | (BrowserMonitorOptions & {
    beforeAnalyze?: (errorContext: {
      type: string
      msg: string
      payload: any
      stack: string
      codeContext: string
    }) => {
      type?: string
      msg?: string
      payload?: any
      stack?: string
      codeContext?: string
    } | false | null | void
  })
}