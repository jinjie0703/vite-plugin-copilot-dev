type SendErrorFn = (type: string, payload: any, msg: string, stack: string) => void

// Helper to safely parse body as JSON or return as string/type info
function parseBody(body: any): any {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body instanceof FormData) {
    const obj: Record<string, any> = {};
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

export function setupNetworkInterceptor(config: any, sendError: SendErrorFn) {
  // Monitor network errors (Fetch)
  if (config.monitorNetworkError) {
    const originalFetch = window.fetch
    window.fetch = async function (...args: any[]) {
      const requestArg = args[0];
      const requestInit = args[1];
      
      const url = typeof requestArg === 'string' ? requestArg : requestArg?.url || 'unknown url';
      const method = (requestInit?.method || (requestArg?.method) || 'GET').toUpperCase();
      
      // Capture Request Details
      let reqHeaders: Record<string, string> = {};
      let reqBody: any = null;
      
      if (requestInit) {
        reqHeaders = parseHeaders(requestInit.headers);
        reqBody = parseBody(requestInit.body);
      } else if (requestArg instanceof Request) {
        reqHeaders = parseHeaders(requestArg.headers);
      }

      try {
        const response = await originalFetch.apply(this, args as any)
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
          } catch (e) {
            sendError(
              'network-fetch',
              JSON.stringify({ request: { url, method, headers: reqHeaders, body: reqBody }, response: { status: response.status, body: 'Cannot read response body' } }),
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
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
      // @ts-ignore
      this._requestUrl = url
      // @ts-ignore
      this._requestMethod = method
      // @ts-ignore
      this._requestHeaders = {}
      // @ts-ignore
      return originalXHROpen.apply(this, [method, url, ...args])
    }
    
    XMLHttpRequest.prototype.setRequestHeader = function (header: string, value: string) {
      // @ts-ignore
      if (this._requestHeaders) {
        // @ts-ignore
        this._requestHeaders[header] = value;
      }
      return originalXHRSetRequestHeader.apply(this, [header, value])
    }

    XMLHttpRequest.prototype.send = function (...args: any[]) {
      const body = args[0];
      // @ts-ignore
      const reqUrl = this._requestUrl;
      // @ts-ignore
      const reqMethod = this._requestMethod || 'GET';
      // @ts-ignore
      const reqHeaders = this._requestHeaders || {};
      const reqBody = parseBody(body);

      this.addEventListener('load', function () {
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
            `Request failed for ${reqUrl}`
          )
        }
      })
      this.addEventListener('error', function () {
        sendError(
          'network-xhr-fatal',
          `URL: ${reqUrl}`,
          `XHR Request Failed (Network/CORS)`,
          'Network Error or Blocked by Client'
        )
      })
      this.addEventListener('timeout', function () {
        if (config.monitorNetworkTimeout) {
          sendError(
            'network-xhr-timeout',
            `URL: ${reqUrl}`,
            `XHR Request Timeout`,
            'Timeout Exceeded'
          )
        }
      })
      return originalXHRSend.apply(this, args as any)
    }
  }
}
