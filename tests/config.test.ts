import { describe, it, expect } from 'vitest'
import { CopilotDevOptionsSchema } from '../src/types/schema'

describe('CopilotDevOptionsSchema', () => {
  it('should apply correct default values when empty options are provided', () => {
    const result = CopilotDevOptionsSchema.parse({})

    // The default for browserMonitor is true
    expect(result.browserMonitor).toBe(true)
    
    // Default mcp is true
    expect(result.mcp).toBe(true)
  })

  it('should override defaults with provided values', () => {
    const result = CopilotDevOptionsSchema.parse({
      browserMonitor: {
        console: { warn: true },
        network: { timeout: true }
      },
      mcp: { enabled: false }
    })

    // TypeScript asserts result.browserMonitor is an object since we provided one
    const monitor = result.browserMonitor as any
    expect(monitor.console.warn).toBe(true)
    expect(monitor.console.error).toBe(true) // Should still keep the default
    expect(monitor.network.timeout).toBe(true)
    
    expect(result.mcp).toEqual({ enabled: false })
  })

  it('should disable browser monitor entirely when false', () => {
    const result = CopilotDevOptionsSchema.parse({
      browserMonitor: false
    })
    
    expect(result.browserMonitor).toBe(false)
  })
})
