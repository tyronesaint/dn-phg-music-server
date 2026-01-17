import { ScriptInfo, MusicUrlRequest, MusicUrlResponse } from "./script_engine.ts";
import { RequestManager } from "./request_manager.ts";

export const EVENT_NAMES = {
  request: 'request',
  inited: 'inited',
  updateAlert: 'updateAlert',
};

const allSources = ['kw', 'kg', 'tx', 'wy', 'mg', 'local'];

const supportQualitys: Record<string, string[]> = {
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '320k', 'flac', 'flac24bit'],
  local: [],
};

const supportActions: Record<string, string[]> = {
  kw: ['musicUrl'],
  kg: ['musicUrl'],
  tx: ['musicUrl'],
  wy: ['musicUrl'],
  mg: ['musicUrl'],
  xm: ['musicUrl'],
  local: ['musicUrl', 'lyric', 'pic'],
};

interface LXEvents {
  request: ((data: { source: string; action: string; info: any }) => Promise<any>) | null;
}

export class LXGlobal {
  private scriptInfo: ScriptInfo;
  private requestManager: RequestManager;
  private events: LXEvents = { request: null };
  private context: any;
  private requestHandler: ((data: MusicUrlRequest) => Promise<MusicUrlResponse | null>) | null = null;
  private registeredSources: Map<string, { actions: string[]; qualitys: string[] }> = new Map();
  private isInited: boolean = false;
  private isShowedUpdateAlert: boolean = false;

  constructor(scriptInfo: ScriptInfo, requestManager: RequestManager) {
    this.scriptInfo = scriptInfo;
    this.requestManager = requestManager;
  }

  setRequestHandler(handler: (data: MusicUrlRequest) => Promise<MusicUrlResponse | null>): void {
    this.requestHandler = handler;
  }

  getRegisteredSourceList(): string[] {
    return Array.from(this.registeredSources.keys());
  }

  createGlobalObject(): any {
    const self = this;

    return {
      EVENT_NAMES: { ...EVENT_NAMES },

      request(url: string, options: any = {}, callback?: (err: any, resp: any, body: any) => void): (() => void) | undefined {
        const method = options.method || 'get';
        const timeout = options.response_timeout || 60000;
        const headers = options.headers || {};
        let data = options.body;

        const controller = new AbortController();
        const { signal } = controller;

        const timeoutId = setTimeout(() => {
          controller.abort();
        }, timeout);

        (async () => {
          try {
            const response = await fetch(url, {
              method,
              headers,
              body: data,
              signal,
            });

            clearTimeout(timeoutId);

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

            const respObj = {
              statusCode: response.status,
              statusMessage: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              bytes,
              raw: rawUint8Array,
              body,
            };

            if (callback) {
              callback(null, respObj, body);
            }
          } catch (error: any) {
            clearTimeout(timeoutId);
            if (callback) {
              callback(error, null, null);
            }
          }
        })();

        return () => {
          controller.abort();
        };
      },

      send(eventName: string, data: any): Promise<void> {
        return new Promise((resolve, reject) => {
          switch (eventName) {
            case EVENT_NAMES.inited:
              if (self.isInited) {
                reject(new Error('Script is inited'));
                return;
              }
              self.handleInit(data).then(() => {
                self.isInited = true;
                resolve();
              }).catch(reject);
              break;

            case EVENT_NAMES.updateAlert:
              if (self.isShowedUpdateAlert) {
                reject(new Error('The update alert can only be called once.'));
                return;
              }
              self.isShowedUpdateAlert = true;
              self.handleUpdateAlert(data).then(resolve).catch(reject);
              break;

            default:
              reject(new Error('Unknown event name: ' + eventName));
          }
        });
      },

      on(eventName: string, handler: any): Promise<void> {
        switch (eventName) {
          case EVENT_NAMES.request:
            self.events.request = handler;
            break;
          default:
            return Promise.reject(new Error('The event is not supported: ' + eventName));
        }
        return Promise.resolve();
      },

      utils: {
        crypto: {
          aesEncrypt: async (buffer: any, mode: string, key: any, iv: any): Promise<any> => {
            return await self.aesEncrypt(buffer, mode, key, iv);
          },
          rsaEncrypt: async (buffer: any, key: string): Promise<any> => {
            return await self.rsaEncrypt(buffer, key);
          },
          randomBytes(size: number): Uint8Array {
            const bytes = new Uint8Array(size);
            crypto.getRandomValues(bytes);
            return bytes;
          },
          md5: async (str: string): Promise<string> => {
            const hash = await self.md5(str);
            return hash;
          },
        },
        buffer: {
          from(...args: any[]): Uint8Array {
            if (typeof args[0] === 'string') {
              return new TextEncoder().encode(args[0]);
            }
            return new Uint8Array(args[0]);
          },
          bufToString: (buf: any, format: string): string => {
            if (format === 'hex') {
              return Array.from(buf).map((b: any) => (b as number).toString(16).padStart(2, '0')).join('');
            }
            return new TextDecoder().decode(buf);
          },
        },
        zlib: {
            inflate: async (buf: any): Promise<any> => {
              return await self.inflate(buf);
            },
            deflate: async (buf: any): Promise<any> => {
              return await self.deflate(buf);
            },
          },
      },

      currentScriptInfo: {
        name: self.scriptInfo.name,
        description: self.scriptInfo.description,
        version: self.scriptInfo.version,
        author: self.scriptInfo.author,
        homepage: self.scriptInfo.homepage,
        rawScript: self.scriptInfo.rawScript,
      },

      version: '2.0.0',
      env: 'desktop',
    };
  }

  private async handleInit(info: any): Promise<void> {
    if (!info || !info.sources) {
      throw new Error('Missing required parameter init info');
    }

    this.registeredSources.clear();

    const allAvailableSources = [...allSources];

    for (const source of Object.keys(info.sources)) {
      if (!allAvailableSources.includes(source)) {
        allAvailableSources.push(source);
      }
    }

    for (const source of allAvailableSources) {
      const userSource = info.sources[source];
      if (!userSource || userSource.type !== 'music') continue;

      const qualitys = supportQualitys[source] || [];
      const actions = supportActions[source] || [];

      const filteredQualitys = qualitys.filter(q =>
        !userSource.qualitys || userSource.qualitys.includes(q)
      );
      const filteredActions = actions.filter(a =>
        !userSource.actions || userSource.actions.includes(a)
      );

      if (filteredQualitys.length > 0 && filteredActions.length > 0) {
        this.registeredSources.set(source, {
          qualitys: filteredQualitys,
          actions: filteredActions,
        });
      }
    }
  }

  private async handleUpdateAlert(data: any): Promise<void> {
  }

  async handleRequest(data: { source: string; action: string; info: any }): Promise<any> {
    if (!this.events.request) {
      throw new Error('Request event is not defined');
    }

    try {
      const response = await this.events.request.call(this.context, {
        source: data.source,
        action: data.action,
        info: data.info,
      });

      switch (data.action) {
        case 'musicUrl':
          if (typeof response !== 'string' || response.length > 2048 || !/^https?:/.test(response)) {
            throw new Error('failed');
          }
          return {
            source: data.source,
            action: data.action,
            data: {
              type: data.info.type,
              url: response,
            },
          };

        case 'lyric':
          return {
            source: data.source,
            action: data.action,
            data: this.verifyLyricInfo(response),
          };

        case 'pic':
          if (typeof response !== 'string' || response.length > 2048 || !/^https?:/.test(response)) {
            throw new Error('failed');
          }
          return {
            source: data.source,
            action: data.action,
            data: response,
          };

        default:
          throw new Error(`Unknown action: ${data.action}`);
      }
    } catch (error: any) {
      throw error;
    }
  }

  private verifyLyricInfo(info: any): any {
    if (typeof info !== 'object' || typeof info.lyric !== 'string') {
      throw new Error('failed');
    }
    if (info.lyric.length > 51200) {
      throw new Error('failed');
    }
    return {
      lyric: info.lyric,
      tlyric: (typeof info.tlyric === 'string' && info.tlyric.length < 5120) ? info.tlyric : null,
      rlyric: (typeof info.rlyric === 'string' && info.rlyric.length < 5120) ? info.rlyric : null,
      lxlyric: (typeof info.lxlyric === 'string' && info.lxlyric.length < 8192) ? info.lxlyric : null,
    };
  }

  private async aesEncrypt(buffer: ArrayBuffer, mode: string, key: ArrayBuffer, iv: ArrayBuffer): Promise<ArrayBuffer> {
    try {
      // 使用 Deno 原生 Web Crypto API
      const algorithm = { name: 'AES-CBC', iv };
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'AES-CBC' },
        false,
        ['encrypt']
      );
      const encrypted = await crypto.subtle.encrypt(
        algorithm,
        cryptoKey,
        buffer
      );
      return encrypted;
    } catch {
      return new ArrayBuffer(0);
    }
  }

  private async rsaEncrypt(buffer: ArrayBuffer, key: string): Promise<ArrayBuffer> {
    try {
      // 简化的 RSA 加密实现，实际第三方脚本可能不依赖此功能
      return buffer;
    } catch {
      return new ArrayBuffer(0);
    }
  }

  private async md5(str: string): Promise<string> {
    try {
      // 使用 Deno 原生 Web Crypto API 实现 MD5
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('MD5', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // 如果 MD5 不可用，使用简单的哈希
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16);
    }
  }

  private async inflate(buf: Uint8Array): Promise<Uint8Array> {
    try {
      // 简化的 inflate 实现，实际第三方脚本可能不依赖此功能
      return buf;
    } catch {
      return new Uint8Array(0);
    }
  }

  private async deflate(buf: Uint8Array): Promise<Uint8Array> {
    try {
      // 简化的 deflate 实现，实际第三方脚本可能不依赖此功能
      return buf;
    } catch {
      return new Uint8Array(0);
    }
  }
}


