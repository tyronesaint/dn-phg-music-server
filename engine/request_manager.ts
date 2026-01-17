interface RequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  timeout: number;
  body?: any;
  form?: Record<string, any>;
  formData?: Record<string, any>;
}

interface Response {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  bytes: number;
  raw: Uint8Array;
  body: any;
}

interface RequestCallback {
  (error: Error | null, response: Response | null, body: any): void;
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36';

const API_CONFIG = {
  oldServers: ['tempmusics.tk', 'tempmusic.xyz', 'tempmusic.top', 'api.lxmusic.ml', 'api.lxmusic.xyz'],
  newServer: 'https://lxmusicapi.onrender.com',
  requestKey: 'share-v2',
  bHh: '624868746c',
  appVersion: '2.10.0',
};

async function handleDeflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const compressionStream = new CompressionStream('deflate-raw');
  const writer = compressionStream.writable.getWriter();
  await writer.write(data as any);
  await writer.close();
  const compressedData = await new Response(compressionStream.readable).arrayBuffer();
  return new Uint8Array(compressedData);
}

async function generateAuthHeader(url: string, headers: Record<string, string>): Promise<void> {
  try {
    if (!headers[API_CONFIG.bHh]) {
      return;
    }

    const path = url.replace(/^https?:\/\/[\w.:]+\//, '/');

    let s = atob(API_CONFIG.bHh);
    s = s.replace(s.slice(-1), '');
    s = atob(s);

    const v = API_CONFIG.appVersion.split('-')[0].split('.').map(n => n.length < 3 ? n.padStart(3, '0') : n).join('');
    const v2 = API_CONFIG.appVersion.split('-')[1] || '';

    const regx = /(?:\d\w)+/g;
    const match = `${path}${v}`.match(regx);

    if (match && match[0]) {
      const dataToCompress = JSON.stringify([match[0], null, 1].concat(v));
      const compressedData = await handleDeflateRaw(new TextEncoder().encode(dataToCompress));
      const base64Data = btoa(String.fromCharCode(...compressedData));
      const hexData = base64Data.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

      headers[s] = !s ? '' : `${hexData}&${parseInt(v)}${v2}`;
      delete headers[API_CONFIG.bHh];
    }
  } catch (error) {
  }
}

export class RequestManager {
  private activeRequests: Map<string, AbortController> = new Map();
  private proxyConfig: { host: string; port: string } = { host: '', port: '' };

  setProxy(host: string, port: string): void {
    this.proxyConfig = { host, port };
  }

  addRequest(options: RequestOptions, callback?: RequestCallback): void {
    const requestKey = this.generateRequestKey(options);
    const controller = new AbortController();

    this.activeRequests.set(requestKey, controller);

    this.executeRequest(options, controller.signal, callback, requestKey);
  }

  private async executeRequest(
    options: RequestOptions,
    signal: AbortSignal,
    callback?: RequestCallback,
    requestKey?: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      let requestBody: string | FormData | undefined;
      let contentType: string | undefined;
      let useJsonEncoding = true;

      if (options.body) {
        requestBody = typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body);
        contentType = 'application/json';
      } else if (options.form) {
        requestBody = new URLSearchParams(options.form).toString();
        contentType = 'application/x-www-form-urlencoded';
        useJsonEncoding = false;
      } else if (options.formData) {
        const form = new FormData();
        for (const [key, value] of Object.entries(options.formData)) {
          form.append(key, value);
        }
        requestBody = form;
        useJsonEncoding = false;
      }

      const headers: Record<string, string> = {
        'User-Agent': DEFAULT_USER_AGENT,
        ...options.headers,
      };

      const requestContentType = contentType || '';

      if (requestContentType && !headers['Content-Type']) {
        headers['Content-Type'] = requestContentType;
      }

      if (this.shouldAddApiKey(options.url)) {
        headers['X-Request-Key'] = API_CONFIG.requestKey;
      }

      await generateAuthHeader(options.url, headers);

      if (this.proxyConfig.host && !this.isLocalUrl(options.url)) {
        const proxyUrl = `http://${this.proxyConfig.host}:${this.proxyConfig.port}`;
        headers['Proxy-Authorization'] = `Basic ${btoa(`${this.proxyConfig.host}:${this.proxyConfig.port}`)}`;
      }

      const fetchOptions: RequestInit = {
        method: options.method.toUpperCase(),
        headers,
        signal,
      };

      if (requestBody) {
        fetchOptions.body = requestBody as BodyInit;
      }

      const response = await fetch(options.url, fetchOptions);
      const responseBody = await response.arrayBuffer();
      const bytes = responseBody.byteLength;

      const rawUint8Array = new Uint8Array(responseBody);
      const rawString = new TextDecoder().decode(responseBody);
      
      let body: any = rawString;

      try {
        body = JSON.parse(rawString);
      } catch (e) {
        body = rawString;
      }

      const resp: Response = {
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        bytes,
        raw: rawUint8Array,
        body: body,
      };

      if (callback) {
        try {
          callback(null, resp, body);
        } catch (callbackError: any) {
          throw callbackError;
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (callback) {
          const errorResponse: Response = {
            statusCode: 0,
            statusMessage: 'Request cancelled',
            headers: {},
            bytes: 0,
            raw: new Uint8Array(0),
            body: null,
          };
          callback(new Error('Request cancelled'), errorResponse, null);
        }
      } else {
        if (callback) {
          const errorResponse: Response = {
            statusCode: 0,
            statusMessage: error.message || 'Request failed',
            headers: {},
            bytes: 0,
            raw: new Uint8Array(0),
            body: null,
          };
          callback(error, errorResponse, null);
        }
      }
    }
  }

  cancelRequest(url: string): void {
    for (const [key, controller] of this.activeRequests) {
      if (key.includes(url)) {
        controller.abort();
        this.activeRequests.delete(key);
      }
    }
  }

  private generateRequestKey(options: RequestOptions): string {
    return `${options.method}_${options.url}_${Date.now()}`;
  }

  private getMirrorUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      if (urlObj.hostname === 'registry.npmjs.org') {
        const mirrorUrl = new URL(url);
        mirrorUrl.hostname = 'registry.npmmirror.com';
        return mirrorUrl.toString();
      }
      
      for (const oldServer of API_CONFIG.oldServers) {
        if (urlObj.hostname === oldServer || urlObj.hostname.endsWith('.' + oldServer)) {
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          if (pathParts.length >= 3) {
            const newUrl = new URL(`${API_CONFIG.newServer}/${pathParts.slice(1).join('/')}`);
            return newUrl.toString();
          }
        }
      }

      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(urlObj.hostname)) {
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        if (pathParts.length >= 3 && urlObj.pathname.includes('/flower/')) {
          const newUrl = new URL(`${API_CONFIG.newServer}/${pathParts.slice(1).join('/')}`);
          return newUrl.toString();
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }

  private shouldAddApiKey(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === new URL(API_CONFIG.newServer).hostname;
    } catch {
      return false;
    }
  }

  private isLocalUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return ['localhost', '127.0.0.1', '::1'].includes(urlObj.hostname) ||
             urlObj.hostname.startsWith('192.168.') ||
             urlObj.hostname.startsWith('10.') ||
             urlObj.hostname.endsWith('.local');
    } catch {
      return false;
    }
  }

  async clearAllRequests(): Promise<void> {
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();
  }
}
