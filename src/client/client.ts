export const CLIENT_INJECT_CODE = `
// Copilot Dev Client Error Monitor
if (import.meta.hot) {
  const ws = import.meta.hot;

  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  function sendError(type, payload, msg, stack) {
    ws.send('copilot:browser-error', { type, payload, msg, stack });
  }

  function safeStringify(obj) {
    const cache = new WeakSet();
    const retVal = JSON.stringify(
      obj,
      (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (cache.has(value)) {
            return '[Circular]';
          }
          cache.add(value);
        }
        return value;
      }
    );
    return retVal;
  }

  // Intercept console.error if enabled
  if (__COPILOT_MONITOR_CONSOLE_ERROR__) {
    console.error = function (...args) {
      originalConsoleError.apply(console, args);
      try {
        const errorStr = args.map(arg => typeof arg === 'object' ? safeStringify(arg) : String(arg)).join(' ');
        const stack = new Error().stack || '';
        sendError('console.error', errorStr, 'Console Error', stack);
      } catch (e) {
        sendError('console.error', 'Stringify error', 'Console Error', '');
      }
    };
  }

  // Intercept console.warn if enabled
  if (__COPILOT_MONITOR_CONSOLE_WARN__) {
    console.warn = function (...args) {
      originalConsoleWarn.apply(console, args);
      try {
        const warnStr = args.map(arg => typeof arg === 'object' ? safeStringify(arg) : String(arg)).join(' ');
        const stack = new Error().stack || '';
        sendError('console.warn', warnStr, 'Console Warning', stack);
      } catch (e) {
        sendError('console.warn', 'Stringify error', 'Console Warning', '');
      }
    };
  }


  // Intercept global uncaught errors if enabled
  if (__COPILOT_MONITOR_WINDOW_ONERROR__) {
    window.addEventListener('error', (event) => {
      const { message, filename, lineno, colno, error } = event;
      const stack = error?.stack || \`at \${filename}:\${lineno}:\${colno}\`;
      sendError('window.onerror', message, 'Uncaught Exception', stack);
    });
  }

  // Intercept unhandled promise rejections if enabled
  if (__COPILOT_MONITOR_WINDOW_UNHANDLEDREJECTION__) {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      let msg = typeof reason === 'string' ? reason : reason?.message || 'Unhandled Rejection';
      let stack = reason?.stack || '';
      sendError('unhandledrejection', msg, 'Unhandled Promise Rejection', stack);
    });
  }

  // Intercept fetch requests if enabled
  if (__COPILOT_MONITOR_NETWORK_ERROR__) {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'unknown url');
      try {
        const response = await originalFetch.apply(this, args);
        if (!response.ok) {
          try {
            const resClone = response.clone();
            const bodyText = await resClone.text();
            sendError('network-fetch', \`URL: \${url} - Status: \${response.status}\`, \`Fetch Error HTTP \${response.status}\`, \`Response Body: \${bodyText.slice(0, 500)}\`);
          } catch(e) {
            sendError('network-fetch', \`URL: \${url} - Status: \${response.status}\`, \`Fetch Error HTTP \${response.status}\`, 'Cannot read response body');
          }
        }
        return response;
      } catch (err) {
        sendError('network-fetch-fatal', \`URL: \${url}\`, \`Fetch Request Failed (Network/CORS)\`, err?.stack || err?.message || String(err));
        throw err; // rethrow 保证业务正常流转
      }
    };

    // Intercept XMLHttpRequest
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalXHROpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._requestUrl = url;
      return originalXHROpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('load', function() {
        if (this.status >= 400) {
          const bodyText = this.responseText ? this.responseText.slice(0, 500) : 'No response text';
          sendError('network-xhr', \`URL: \${this._requestUrl} - Status: \${this.status}\`, \`XHR Error HTTP \${this.status}\`, \`Response Body: \${bodyText}\`);
        }
      });
      this.addEventListener('error', function() {
        sendError('network-xhr-fatal', \`URL: \${this._requestUrl}\`, \`XHR Request Failed (Network/CORS)\`, 'Network Error or Blocked by Client');
      });
      this.addEventListener('timeout', function() {
        if (__COPILOT_MONITOR_NETWORK_TIMEOUT__) {
          sendError('network-xhr-timeout', \`URL: \${this._requestUrl}\`, \`XHR Request Timeout\`, 'Timeout Exceeded');
        }
      });
      return originalXHRSend.apply(this, args);
    };
  }
}
`
