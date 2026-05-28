type SendErrorFn = (type: string, payload: any, msg: string, stack: string) => void

export function setupNetworkInterceptor(config: any, sendError: SendErrorFn) {
  // Monitor network errors (Fetch)
  if (config.monitorNetworkError) {
    const originalFetch = window.fetch
    window.fetch = async function (...args: any[]) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown url'
      try {
        const response = await originalFetch.apply(this, args as any)
        if (!response.ok) {
          try {
            const resClone = response.clone()
            const bodyText = await resClone.text()
            sendError(
              'network-fetch',
              `URL: ${url} - Status: ${response.status}`,
              `Fetch Error HTTP ${response.status}`,
              `Response Body: ${bodyText.slice(0, 500)}`
            )
          } catch (e) {
            sendError(
              'network-fetch',
              `URL: ${url} - Status: ${response.status}`,
              `Fetch Error HTTP ${response.status}`,
              'Cannot read response body'
            )
          }
        }
        return response
      } catch (err: any) {
        sendError(
          'network-fetch-fatal',
          `URL: ${url}`,
          `Fetch Request Failed (Network/CORS)`,
          err?.stack || err?.message || String(err)
        )
        throw err // rethrow 保证业务正常流转
      }
    }

    // Intercept XMLHttpRequest
    const originalXHRSend = XMLHttpRequest.prototype.send
    const originalXHROpen = XMLHttpRequest.prototype.open

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
      // @ts-ignore
      this._requestUrl = url
      // @ts-ignore
      return originalXHROpen.apply(this, [method, url, ...args])
    }

    XMLHttpRequest.prototype.send = function (...args: any[]) {
      this.addEventListener('load', function () {
        if (this.status >= 400) {
          const bodyText = this.responseText ? this.responseText.slice(0, 500) : 'No response text'
          sendError(
            'network-xhr',
            // @ts-ignore
            `URL: ${this._requestUrl} - Status: ${this.status}`,
            `XHR Error HTTP ${this.status}`,
            `Response Body: ${bodyText}`
          )
        }
      })
      this.addEventListener('error', function () {
        sendError(
          'network-xhr-fatal',
          // @ts-ignore
          `URL: ${this._requestUrl}`,
          `XHR Request Failed (Network/CORS)`,
          'Network Error or Blocked by Client'
        )
      })
      this.addEventListener('timeout', function () {
        if (config.monitorNetworkTimeout) {
          sendError(
            'network-xhr-timeout',
            // @ts-ignore
            `URL: ${this._requestUrl}`,
            `XHR Request Timeout`,
            'Timeout Exceeded'
          )
        }
      })
      return originalXHRSend.apply(this, args as any)
    }
  }
}
