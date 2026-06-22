import { z } from 'zod'

export const BrowserMonitorOptionsSchema = z.object({
  console: z.object({
    error: z.boolean().default(true),
    warn: z.boolean().default(false),
  }).default({} as any),
  window: z.object({
    onerror: z.boolean().default(true),
    unhandledrejection: z.boolean().default(true),
  }).default({} as any),
  network: z.object({
    error: z.boolean().default(false),
    timeout: z.boolean().default(false),
  }).default({} as any),
  cacheExpirySeconds: z.number().default(120),
  beforeAnalyze: z.function().optional().describe('Hook to intercept errors before sending'),
}).default({} as any)

// MCPOptions Schema is currently loose but allows boolean or detailed object
export const McpServerOptionsSchema = z.union([
  z.boolean(),
  z.object({
    enabled: z.boolean().default(true),
    basePath: z.string().optional()
  })
]).default(true)

export const CopilotDevOptionsSchema = z.object({
  browserMonitor: z.union([
    z.boolean(),
    BrowserMonitorOptionsSchema
  ]).default(true),
  logFilter: z.custom<((level: 'warn' | 'error', msg: string) => boolean)>().optional(),
  mcp: McpServerOptionsSchema
}).default({} as any)
