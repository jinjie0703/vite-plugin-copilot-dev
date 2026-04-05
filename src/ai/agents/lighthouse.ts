// core/lighthouse.ts
import { preview, PreviewServer } from 'vite'
import fs from 'fs'
import path from 'path'
import { LighthouseOptions } from '../../types'
import { logger } from '../../utils/logger'

export async function runLighthouseAnalysis(options: LighthouseOptions) {
  logger.info('\\n🚀 Starting Performance & Lighthouse analysis...')

  let server: PreviewServer | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chromeLauncher: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lighthouse: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let puppeteer: any = null
  let chromeOptions

  try {
    chromeLauncher = await import('chrome-launcher')
    const lhModule = await import('lighthouse')
    lighthouse = lhModule.default || lhModule
    puppeteer = await import('puppeteer-core')
  } catch (err) {
    logger.error(
      'You need to install "lighthouse", "chrome-launcher" and "puppeteer-core". Run:',
      err
    )
    logger.error('   npm i -D lighthouse chrome-launcher puppeteer-core')
    return
  }

  try {
    const outDir = options.outDir || 'dist'

    server = await preview({
      preview: { port: 4173, open: false },
      build: { outDir },
    })

    const baseUrl = server.resolvedUrls?.local[0] || 'http://localhost:4173/'
    const targetUrl = new URL(options.targetPath || '', baseUrl).href

    logger.info(`🌐 Application running at base URL: ${baseUrl}`)
    logger.info(`🎯 Evaluating target URL: ${targetUrl}`)

    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] })
    chromeOptions = chrome

    if (options.onBeforeRun) {
      logger.info('🤖 Running pre-flight script (e.g., login automation)...')
      try {
        const resp = await fetch(`http://127.0.0.1:${chrome.port}/json/version`)
        const data = await resp.json()
        const browser = await puppeteer.connect({
          browserWSEndpoint: data.webSocketDebuggerUrl,
        })

        const pages = await browser.pages()
        const page = pages.length > 0 ? pages[0] : await browser.newPage()

        await options.onBeforeRun(browser, page, baseUrl)
        logger.success('✅ Pre-flight script executed successfully.')

        await browser.disconnect()
      } catch (autoErr) {
        logger.error('❌ Failed to run pre-flight automation:', autoErr)
      }
    }

    const lhOptions = {
      logLevel: 'error',
      output: 'html',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port,
      formFactor: 'desktop',
      throttlingMethod: 'provided',
      disableStorageReset: true,
      maxWaitForLoad: options.maxWaitForLoad || 90000,
      screenEmulation: {
        mobile: false,
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        disabled: false,
      },
    }

    logger.info('⏳ Running Lighthouse... (this might take a few seconds)')
    const runnerResult = await lighthouse(targetUrl, lhOptions)

    if (runnerResult) {
      const reportHtml = runnerResult.report
      const scores = {
        Performance: Math.round(runnerResult.lhr.categories.performance.score * 100),
        Accessibility: Math.round(runnerResult.lhr.categories.accessibility.score * 100),
        'Best Practices': Math.round(runnerResult.lhr.categories['best-practices'].score * 100),
        SEO: Math.round(runnerResult.lhr.categories.seo.score * 100),
      }

      console.log('\\n📊 Lighthouse Scores:')
      console.table(scores)

      const outPath = path.resolve(process.cwd(), outDir, 'lighthouse-report.html')

      if (!fs.existsSync(path.resolve(process.cwd(), outDir))) {
        fs.mkdirSync(path.resolve(process.cwd(), outDir), { recursive: true })
      }

      fs.writeFileSync(outPath, reportHtml as string)
      logger.success(`Detailed Lighthouse report saved to: ${outPath}\n`)
    }
  } catch (e) {
    logger.error('Error running lighthouse:', e)
  } finally {
    if (chromeOptions) await chromeOptions.kill()
    if (server && server.httpServer) {
      server.httpServer.close()
    }
  }
}
