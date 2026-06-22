type SendErrorFn = (type: string, payload: unknown, msg: string, stack: string) => void

// Helper to safely parse body as JSON or return as string/type info
function parseBody(body: unknown): unknown {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body instanceof FormData) {
    const obj: Record<string, unknown> = {};
    body.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }
  if (body instanceof Blob) return `[Blob: ${body.type}, ${body.size} bytes]`;
  if (body instanceof ArrayBuffer) return `[ArrayBuffer: ${body.byteLength} bytes]`;
  return '[Object or Stream]';
}

function parseHeaders(headers: Headers | HeadersInit | undefined | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      result[key] = value;
    });
  } else {
    Object.assign(result, headers as Record<string, string>);
  }
  return result;
}

function parseXHRHeaders(headerStr: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!headerStr) return headers;
  
  const headerPairs = headerStr.trim().split(/[\r\n]+/);
  headerPairs.forEach(line => {
    const parts = line.split(': ');
    const header = parts.shift();
    const value = parts.join(': ');
    if (header) headers[header] = value;
  });
  return headers;
}

import type { BrowserMonitorOptions } from '../../types'

interface TrackedXHR extends XMLHttpRequest {
  _requestUrl?: string | URL;
  _requestMethod?: string;
  _requestHeaders?: Record<string, string>;
}

export function setupNetworkInterceptor(config: BrowserMonitorOptions, sendError: SendErrorFn) {
  // Monitor network errors (Fetch)
  if (config.network?.error) {
    const originalFetch = window.fetch
    window.fetch = async function (...args: Parameters<typeof window.fetch>) {
      const requestArg = args[0];
      const requestInit = args[1];
      
      const url = typeof requestArg === 'string' ? requestArg : (requestArg as Request)?.url || 'unknown url';
      const method = (requestInit?.method || ((requestArg as Request)?.method) || 'GET').toUpperCase();
      
      // Capture Request Details
      let reqHeaders: Record<string, string> = {};
      let reqBody: unknown = null;
      
      if (requestInit) {
        reqHeaders = parseHeaders(requestInit.headers);
        reqBody = parseBody(requestInit.body);
      } else if (requestArg instanceof Request) {
        reqHeaders = parseHeaders(requestArg.headers);
      }

      try {
        const response = await originalFetch.apply(this, args)
        if (!response.ok) {
          try {
            const resClone = response.clone()
            const bodyText = await resClone.text()
            
            const payload = {
              request: { url, method, headers: reqHeaders, body: reqBody },
              response: { 
                status: response.status, 
                headers: parseHeaders(response.headers), 
                body: parseBody(bodyText) 
              }
            };

            sendError(
              'network-fetch',
              JSON.stringify(payload),
              `Fetch Error HTTP ${response.status}`,
              `Request failed for ${url}`
            )
          } catch {
            sendError(
              'network-fetch',
              JSON.stringify({ request: { url, method, headers: reqHeaders, body: reqBody }, response: { status: response.status, body: 'Cannot read response body' } }),
              `Fetch Error HTTP ${response.status}`,
              'Cannot read response body'
            )
          }
        }
        return response
      } catch (err: unknown) {
        sendError(
          'network-fetch-fatal',
          `URL: ${url}`,
          `Fetch Request Failed (Network/CORS)`,
          err instanceof Error ? (err.stack || err.message) : String(err)
        )
        throw err // rethrow 保证业务正常流转
      }
    }

    // Intercept XMLHttpRequest
    const originalXHRSend = XMLHttpRequest.prototype.send
    const originalXHROpen = XMLHttpRequest.prototype.open
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader

    XMLHttpRequest.prototype.open = function (this: TrackedXHR, method: string, url: string | URL, ...args: unknown[]) {
      this._requestUrl = url
      this._requestMethod = method
      this._requestHeaders = {}
      // We know open accepts (method, url, async, user, password), we cast args safely for call.
      return originalXHROpen.apply(this, [method, url, ...(args as [boolean, string?, string?])])
    }
    
    XMLHttpRequest.prototype.setRequestHeader = function (this: TrackedXHR, header: string, value: string) {
      if (this._requestHeaders) {
        this._requestHeaders[header] = value;
      }
      return originalXHRSetRequestHeader.apply(this, [header, value])
    }

    XMLHttpRequest.prototype.send = function (this: TrackedXHR, ...args: Parameters<XMLHttpRequest['send']>) {
      const body = args[0];
      const reqUrl = this._requestUrl;
      const reqMethod = this._requestMethod || 'GET';
      const reqHeaders = this._requestHeaders || {};
      const reqBody = parseBody(body);

      this.addEventListener('load', function (this: TrackedXHR) {
        if (this.status >= 400) {
          const bodyText = this.responseText || '';
          const resHeaders = parseXHRHeaders(this.getAllResponseHeaders());
          
          const payload = {
            request: { url: reqUrl, method: reqMethod, headers: reqHeaders, body: reqBody },
            response: { 
              status: this.status, 
              headers: resHeaders, 
              body: parseBody(bodyText) 
            }
          };

          sendError(
            'network-xhr',
            JSON.stringify(payload),
            `XHR Error HTTP ${this.status}`,
            `Request failed for ${String(reqUrl)}`
          )
        }
      })
      this.addEventListener('error', function (this: TrackedXHR) {
        sendError(
          'network-xhr-fatal',
          `URL: ${String(reqUrl)}`,
          `XHR Request Failed (Network/CORS)`,
          'Network Error or Blocked by Client'
        )
      })
      this.addEventListener('timeout', function (this: TrackedXHR) {
        if (config.network?.timeout) {
          sendError(
            'network-xhr-timeout',
            `URL: ${String(reqUrl)}`,
            `XHR Request Timeout`,
            'Timeout Exceeded'
          )
        }
      })
      return originalXHRSend.apply(this, args)
    }
  }
}
