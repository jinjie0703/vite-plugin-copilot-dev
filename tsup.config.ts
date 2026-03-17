import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/ai-runner.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node16',
  external: ['vite', 'dotenv', 'puppeteer-core', 'chrome-launcher', 'lighthouse'],
})
