import { ScriptInfo, MusicUrlRequest, MusicUrlResponse } from "./script_engine.ts";
import { RequestManager } from "./request_manager.ts";

export class Sandbox {
  private scriptInfo: ScriptInfo;
  private requestManager: RequestManager;
  private isInitialized: boolean = false;
  private registeredSources: Map<string, any> = new Map();
  private requestHandler: any = null;

  constructor(scriptInfo: ScriptInfo, requestManager: RequestManager) {
    this.scriptInfo = scriptInfo;
    this.requestManager = requestManager;
  }

  async initialize(): Promise<void> {
    try {
      console.log('[Sandbox] 开始初始化脚本:', this.scriptInfo.name);
      
      // 完全按照桌面版的实现
      const allSources = ['kw', 'kg', 'tx', 'wy', 'mg', 'local'];
      const supportQualitys = {
        kw: ['128k', '320k', 'flac', 'flac24bit'],
        kg: ['128k', '320k', 'flac', 'flac24bit'],
        tx: ['128k', '320k', 'flac', 'flac24bit'],
        wy: ['128k', '320k', 'flac', 'flac24bit'],
        mg: ['128k', '320k', 'flac', 'flac24bit'],
        local: [],
      };
      const supportActions = {
        kw: ['musicUrl'],
        kg: ['musicUrl'],
        tx: ['musicUrl'],
        wy: ['musicUrl'],
        mg: ['musicUrl'],
        xm: ['musicUrl'],
        local: ['musicUrl', 'lyric', 'pic'],
      };

      // 设置全局变量
      (globalThis as any).DEV_ENABLE = false;
      (globalThis as any).UPDATE_ENABLE = true;
      (globalThis as any).API_URL = '';
      (globalThis as any).API_KEY = '';
      (globalThis as any).MUSIC_QUALITY = {
        '128k': 128000,
        '320k': 320000,
        'flac': 999000,
        'flac24bit': 999000,
      };
      (globalThis as any).MUSIC_SOURCE = 'kw';

      // 设置事件系统
      const EVENT_NAMES = {
        request: 'request',
        inited: 'inited',
        updateAlert: 'updateAlert',
      };

      let isInited = false;
      let isShowedUpdateAlert = false;
      let isInitedApi = false;
      let events = { request: null };
      let eventNames = Object.values(EVENT_NAMES);
      let initError = null;

      // 设置全局事件对象
      (globalThis as any).events = events;
      (globalThis as any).EVENT_NAMES = EVENT_NAMES;
      (globalThis as any).isInited = isInited;
      (globalThis as any).isShowedUpdateAlert = isShowedUpdateAlert;
      (globalThis as any).isInitedApi = isInitedApi;
      (globalThis as any).initError = initError;

      // 设置全局错误处理器
      (globalThis as any).__lx_init_error_handler__ = {
        sendError: (errorMessage: string) => {
          if (isInitedApi) return;
          isInitedApi = true;
          console.error('[Sandbox] 脚本初始化错误:', errorMessage);
          initError = errorMessage;
        }
      };

      // 添加全局错误监听器
      if (typeof globalThis.addEventListener === 'undefined') {
        (globalThis as any).addEventListener = (eventType: string, handler: any) => {
          console.log('[Sandbox] 添加事件监听器:', eventType);
        };
      }

      globalThis.addEventListener('error', (event: any) => {
        console.error('[Sandbox] 脚本运行时错误:', event.message);
        console.error('[Sandbox] 错误详情:', event);
      });

      globalThis.addEventListener('unhandledrejection', (event: any) => {
        console.error('[Sandbox] 脚本未处理的Promise拒绝:', event.reason);
        console.error('[Sandbox] Promise拒绝详情:', event);
      });

      // 设置初始化错误处理器
      globalThis.addEventListener('error', (event: any) => {
        if (event.isTrusted) (globalThis as any).__lx_init_error_handler__.sendError(event.message.replace(/^Uncaught\\sError:\\s/, ''));
      });

      globalThis.addEventListener('unhandledrejection', (event: any) => {
        if (!event.isTrusted) return;
        const message = typeof event.reason === 'string' ? event.reason : event.reason?.message ?? String(event.reason);
        (globalThis as any).__lx_init_error_handler__.sendError(message.replace(/^Error:\\s/, ''));
      });

      // 创建响应对象
      let _internalResponse: any = {
        statusCode: 0,
        statusMessage: 'No response',
        headers: {},
        bytes: 0,
        raw: new Uint8Array(0),
        body: null
      };

      // 创建API对象
      const API = new Proxy({}, {
        get: (target: any, prop: string) => {
          if (prop === 'Response') {
            console.log('[Sandbox] API.Response get:', _internalResponse);
            return _internalResponse;
          }
          return target[prop];
        },
        set: (target: any, prop: string, value: any) => {
          if (prop === 'Response') {
            console.log('[Sandbox] API.Response set:', value);
            if (value && typeof value === 'object' && 'body' in value) {
              _internalResponse = value;
            } else {
              console.log('[Sandbox] API.Response set to invalid value, keeping current');
            }
            return true;
          }
          target[prop] = value;
          return true;
        }
      });

      (globalThis as any).API = API;
      (globalThis as any)._internalResponse = _internalResponse;

      // 设置全局响应变量
      (globalThis as any).response = null;
      (globalThis as any).APIResponse = null;
      (globalThis as any).apiResponse = null;
      (globalThis as any).api_response = null;

      // 创建request函数（完全按照桌面版实现）
      const request = function(this: any, url: string, options: any, callback: any) {
        console.log('[Sandbox] request called:');
        console.log('[Sandbox]   URL:', url);
        console.log('[Sandbox]   Options:', JSON.stringify(options, null, 2));
        
        // 替换不可用的 API 服务器
        const oldUrl = url;
        if (url.includes('88.lxmusic.xn--fiqs8s')) {
          // 移除 sign 参数并替换 API 服务器
          url = url.replace('88.lxmusic.xn--fiqs8s/lxmusicv4', 'lxmusicapi.onrender.com');
          // 移除 sign 参数
          const urlObj = new URL(url);
          urlObj.searchParams.delete('sign');
          url = urlObj.toString();
          console.log('[Sandbox]   URL 替换:', oldUrl, '->', url);
        }
        
        const method = options && options.method ? options.method : 'get';
        const timeout = options && options.response_timeout ? options.response_timeout : 60000;
        const headers = options && options.headers ? options.headers : {};
        const data = options && options.body ? options.body : undefined;
        const form = options && options.form ? options.form : undefined;
        const formData = options && options.formData ? options.formData : undefined;

        // 替换 API KEY
        if (oldUrl.includes('88.lxmusic.xn--fiqs8s') && headers && headers['X-Request-Key'] === 'lxmusic') {
          headers['X-Request-Key'] = 'share-v2';
          console.log('[Sandbox]   API KEY 替换: lxmusic -> share-v2');
        }

        console.log('[Sandbox]   Method:', method);
        console.log('[Sandbox]   Headers:', JSON.stringify(headers, null, 2));
        console.log('[Sandbox]   Body:', data ? data.substring(0, 100) : 'undefined');
        console.log('[Sandbox]   Form:', form ? JSON.stringify(form).substring(0, 100) : 'undefined');
        console.log('[Sandbox]   FormData:', formData ? 'present' : 'undefined');

        // 按照桌面版实现，使用fetch但模拟needle的行为
        const fetchOptions: any = {
          method: method,
          headers: headers,
        };

        if (data) {
          fetchOptions.body = data;
        } else if (form) {
          fetchOptions.body = new URLSearchParams(form).toString();
          fetchOptions.headers = {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded'
          };
        } else if (formData) {
          fetchOptions.body = formData;
          fetchOptions.headers = {
            ...headers,
            'Content-Type': 'multipart/form-data'
          };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => { controller.abort(); }, timeout);

        fetchOptions.signal = controller.signal;

        const lxContext = this;

        fetch(url, fetchOptions).then((response: any) => {
          clearTimeout(timeoutId);
          console.log('[Sandbox] Response received:');
          console.log('[Sandbox]   Status:', response.status, response.statusText);
          console.log('[Sandbox]   Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
          
          return response.arrayBuffer().then((responseBody: ArrayBuffer) => {
            const bytes = responseBody.byteLength;
            const rawUint8Array = new Uint8Array(responseBody);
            const rawString = new TextDecoder().decode(responseBody);
            let body = rawString;
            try { body = JSON.parse(rawString); } catch (e) {}
            
            const headersObj: any = {};
            if (typeof response.headers.forEach === 'function') {
              response.headers.forEach((value: string, key: string) => {
                headersObj[key] = value;
              });
            } else {
              Object.assign(headersObj, response.headers || {});
            }
            
            const respObj = { 
              statusCode: response.status, 
              statusMessage: response.statusText, 
              headers: headersObj, 
              bytes: bytes, 
              raw: rawUint8Array, 
              body: body 
            };
            
            _internalResponse = respObj;
            
            console.log('[Sandbox] Response body preview:', typeof body === 'string' ? body.substring(0, 200) : JSON.stringify(body).substring(0, 200));
            const bodyObj = typeof body === 'object' && body ? body : {};
            console.log('[Sandbox] 准备调用 callback, body.url:', (bodyObj as any).url);
            
            if (callback) {
              // 确保 resp.body 包含解析后的 body
              const enhancedResp = {
                ...respObj,
                body: body
              };
              console.log('[Sandbox] 调用 callback，使用 enhancedResp.body');
              // 只传递 enhancedResp，让脚本从 resp.body 获取 body
              const callbackResult = callback.call(lxContext, null, enhancedResp);
              console.log('[Sandbox] callback 返回:', callbackResult);
            }
          });
        }).catch((error: any) => {
          clearTimeout(timeoutId);
          const respObj = { 
            statusCode: 0, 
            statusMessage: error.message || 'Network error', 
            headers: {}, 
            bytes: 0, 
            raw: new Uint8Array(0), 
            body: null 
          };
          _internalResponse = respObj;
          if (callback) callback.call(lxContext, error, null, null);
        });

        return () => { 
          if (!controller.signal.aborted) controller.abort(); 
        };
      };

      // 创建send函数（完全按照桌面版实现）
      const send = (eventName: string, data: any) => {
        console.log('[Sandbox] send called:', eventName, data);
        return new Promise((resolve, reject) => {
          if (!eventNames.includes(eventName)) return reject(new Error('The event is not supported: ' + eventName));
          switch (eventName) {
            case EVENT_NAMES.inited:
              console.log('[Sandbox] 脚本调用 send(inited)');
              if (isInitedApi) return reject(new Error('Script is inited'));
              isInitedApi = true;
              if ((globalThis as any)._handleInit) {
                (globalThis as any)._handleInit(data).then(() => { resolve(); }).catch(reject);
              } else {
                console.log('[Sandbox] _handleInit 不存在，直接resolve');
                resolve();
              }
              break;
            case EVENT_NAMES.updateAlert:
              if (isShowedUpdateAlert) return reject(new Error('The update alert can only be called once.'));
              isShowedUpdateAlert = true;
              if ((globalThis as any)._handleUpdateAlert) {
                (globalThis as any)._handleUpdateAlert(data).then(resolve).catch(reject);
              } else {
                resolve();
              }
              break;
            default:
              reject(new Error('Unknown event name: ' + eventName));
          }
        });
      };

      // 创建on函数（完全按照桌面版实现）
      const on = (eventName: string, handler: any) => {
        console.log('[Sandbox] on called:', eventName);
        if (!eventNames.includes(eventName)) return Promise.reject(new Error('The event is not supported: ' + eventName));
        switch (eventName) {
          case EVENT_NAMES.request:
            events.request = handler;
            console.log('[Sandbox] events.request 已设置');
            
            // 包装原始handler，添加日志
            const originalHandler = handler;
            events.request = function(...args: any[]) {
              console.log('[Sandbox] events.request 被调用:');
              console.log('[Sandbox]   Args:', JSON.stringify(args, null, 2));
              const result = originalHandler.apply(this, args);
              console.log('[Sandbox]   Result type:', typeof result);
              console.log('[Sandbox]   Result:', result ? (typeof result === 'string' ? result.substring(0, 200) : 'Promise') : 'undefined');
              return result;
            };
            break;
          default:
            return Promise.reject(new Error('The event is not supported: ' + eventName));
        }
        return Promise.resolve();
      };

      // 创建utils对象（完全按照桌面版实现）
      const utils = {
        crypto: {
          aesEncrypt: (buffer: any, mode: string, key: any, iv: any) => {
            console.log('[Sandbox] aesEncrypt called');
            // 简化实现，实际应该使用加密算法
            return buffer;
          },
          rsaEncrypt: (buffer: any, key: string) => {
            console.log('[Sandbox] rsaEncrypt called');
            // 简化实现，实际应该使用RSA加密
            return buffer;
          },
          randomBytes: (size: number) => {
            const bytes = new Uint8Array(size);
            crypto.getRandomValues(bytes);
            return bytes;
          },
          md5: (str: string) => {
            console.log('[Sandbox] md5 called:', str);
            // 简化实现，实际应该使用MD5算法
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
              const char = str.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash;
            }
            return Math.abs(hash).toString(16);
          },
        },
        buffer: {
          from: (...args: any[]) => {
            if (typeof args[0] === 'string') return new TextEncoder().encode(args[0]);
            return new Uint8Array(args[0]);
          },
          bufToString: (buf: any, format: string) => {
            if (format === 'hex') {
              return Array.from(buf).map((b: any) => (b as number).toString(16).padStart(2, '0')).join('');
            }
            return new TextDecoder().decode(buf);
          },
        },
        zlib: {
          inflate: (buf: any) => {
            console.log('[Sandbox] inflate called');
            // 简化实现，实际应该使用zlib解压
            return new Promise((resolve) => { resolve(buf); });
          },
          deflate: (buf: any) => {
            console.log('[Sandbox] deflate called');
            // 简化实现，实际应该使用zlib压缩
            return new Promise((resolve) => { resolve(buf); });
          },
        },
      };

      // 创建lx对象（完全按照桌面版实现）
      const lx = {
        EVENT_NAMES,
        request,
        send,
        on,
        utils,
        currentScriptInfo: {
          name: this.scriptInfo.name,
          description: this.scriptInfo.description,
          version: this.scriptInfo.version,
          author: this.scriptInfo.author,
          homepage: this.scriptInfo.homepage,
          rawScript: this.scriptInfo.rawScript,
        },
        version: '2.0.0',
        env: 'desktop',
      };

      (globalThis as any).lx = lx;

      // 设置handleInit函数（完全按照桌面版实现）
      (globalThis as any)._handleInit = (info: any) => {
        console.log('[Sandbox] _handleInit called:', info);
        return new Promise((resolve) => {
          const sourceInfo = { sources: {} };
          
          try {
            if (!info || !info.sources) {
              console.log('[Sandbox] 脚本未提供音源信息，使用默认音源');
              for (let i = 0; i < allSources.length; i++) {
                const source = allSources[i];
                sourceInfo.sources[source] = {
                  type: 'music',
                  actions: supportActions[source] || [],
                  qualitys: supportQualitys[source] || [],
                };
              }
            } else {
              for (let i = 0; i < allSources.length; i++) {
                const source = allSources[i];
                const userSource = info.sources && info.sources[source];
                if (!userSource || userSource.type !== 'music') continue;
                const qualitys = supportQualitys[source];
                const actions = supportActions[source];
                sourceInfo.sources[source] = {
                  type: 'music',
                  actions: actions.filter((a: string) => userSource.actions.includes(a)),
                  qualitys: qualitys.filter((q: string) => userSource.qualitys.includes(q)),
                };
              }
            }
            
            console.log('[Sandbox] 注册的音源:', Object.keys(sourceInfo.sources));
            (globalThis as any)._registeredSources = sourceInfo.sources;
            (globalThis as any)._sources = sourceInfo.sources;
            resolve();
          } catch (error) {
            console.error('[Sandbox] 初始化失败:', error);
            resolve();
          }
        });
      };

      // 设置handleUpdateAlert函数
      (globalThis as any)._handleUpdateAlert = (data: any) => {
        console.log('[Sandbox] _handleUpdateAlert called:', data);
        return Promise.resolve();
      };

      // 设置全局对象
      (globalThis as any).globalThis = globalThis;
      (globalThis as any).window = globalThis;

      // 添加 require 函数模拟（用于支持 Node.js 风格的模块加载）
      (globalThis as any).require = (moduleName: string) => {
        console.log('[Sandbox] require called:', moduleName);
        switch (moduleName) {
          case 'crypto':
            return {
              createHash: (algorithm: string) => ({
                update: (data: string) => ({
                  digest: (encoding: string) => {
                    const hash = new TextEncoder().encode(data);
                    const hashArray = Array.from(hash);
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    return hashHex;
                  }
                })
              })
            };
          case 'buffer':
            return { Buffer };
          default:
            console.log('[Sandbox] Unknown module:', moduleName);
            return {};
        }
      };

      // 添加 regenerator runtime 支持（用于支持 async/await）
      const mark = (genFun: any) => {
        if (Object.setPrototypeOf) {
          Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
        } else {
          genFun.__proto__ = GeneratorFunctionPrototype;
        }
        genFun.prototype = Object.create(Gp);
        return genFun;
      };

      const wrap = (innerFn: any, outerFn: any, self: any, tryLocsList: any) => {
        const protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
        const generator = Object.create(protoGenerator.prototype);
        const context = new Context(tryLocsList || []);
        generator._invoke = makeInvokeMethod(innerFn, self, context);
        return generator;
      };

      const tryCatch = (fn: any, obj: any, arg: any) => {
        try {
          return { type: "normal", arg: fn.call(obj, arg) };
        } catch (err) {
          return { type: "throw", arg: err };
        }
      };

      const Generator = function() {};
      const GeneratorFunction = function GeneratorFunction() {};
      const GeneratorFunctionPrototype = GeneratorFunction.prototype;
      const IteratorPrototype = {};
      const Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
      Gp.constructor = GeneratorFunctionPrototype;
      GeneratorFunctionPrototype.constructor = GeneratorFunction;
      GeneratorFunction.displayName = "GeneratorFunction";

      const defineIteratorMethods = (prototype: any) => {
        ["next", "throw", "return"].forEach((method) => {
          prototype[method] = function(arg: any) {
            return this._invoke(method, arg);
          };
        });
      };
      defineIteratorMethods(Gp);

      const AsyncIterator = function() {};
      AsyncIterator.prototype = Gp;

      const asyncIterator = (innerFn: any, outerFn: any, self: any) => {
        const iter = wrap(innerFn, outerFn, self, []);
        return new Promise((resolve, reject) => {
          const step = () => {
            const result = iter.next();
            if (result.done) {
              resolve(result.value);
            } else {
              Promise.resolve(result.value).then(
                (val) => { step(); },
                (err) => { iter.throw(err); step(); }
              );
            }
          };
          step();
        });
      };

      const makeInvokeMethod = (innerFn: any, self: any, context: any) => {
        let state = "suspendedStart";
        return function(method: string, arg: any) {
          if (state === "completed") {
            throw new TypeError("Generator is already running");
          }
          if (state === "suspendedYield") {
            state = "executing";
          }
          if (state === "executing") {
            throw new TypeError("Generator is already running");
          }
          state = "executing";
          const record = tryCatch(innerFn, self, context);
          if (record.type === "normal") {
            state = "completed";
            if (record.arg === ContinueSentinel) {
              context.next = context.sent;
            } else {
              context.sent = record.arg;
            }
            return { value: record.arg, done: false };
          } else if (record.type === "throw") {
            state = "completed";
            throw record.arg;
          }
        };
      };

      const ContinueSentinel = {};

      const Context = function(tryLocsList: any) {
        this.tryEntries = [{ tryLoc: "root" }];
        tryLocsList.forEach((tryLoc: any) => {
          this.tryEntries.push({ tryLoc: tryLoc });
        });
        this.reset(true);
      };

      Context.prototype.reset = function(skipTemp: any) {
        this.prev = 0;
        this.next = 0;
        this.sent = this._sent = undefined;
        this.done = false;
        this.delegate = null;
        this.method = "next";
        this.arg = undefined;
        this.tryEntries.forEach((tryEntry: any) => {
          tryEntry.completion = { type: "normal", arg: undefined };
        });
        if (skipTemp) {
          for (let i = 0; i < this.tryEntries.length; i++) {
            const entry = this.tryEntries[i];
            if (entry.tryLoc === "root") {
              this.next = entry.afterLoc;
              break;
            }
          }
        }
      };

      (globalThis as any).regeneratorRuntime = {
        wrap: wrap,
        mark: mark,
        async: asyncIterator,
      };
      (globalThis as any)._regeneratorRuntime = (globalThis as any).regeneratorRuntime;

      // 执行脚本
      console.log('[Sandbox] 开始执行脚本...');
      console.log('[Sandbox] 脚本代码长度:', this.scriptInfo.rawScript.length);
      
      const startTime = Date.now();
      
      try {
        const scriptFn = new Function(this.scriptInfo.rawScript);
        scriptFn();
        console.log('[Sandbox] 脚本执行完成');
      } catch (evalError: any) {
        console.error('[Sandbox] 脚本代码执行错误:', String(evalError));
        if (evalError?.stack) {
          console.error('[Sandbox] 错误堆栈:', String(evalError.stack));
        }
      }
      
      const endTime = Date.now();
      console.log('[Sandbox] 脚本代码执行完成, 耗时:', (endTime - startTime) + 'ms');

      // 检查脚本是否正确初始化
      setTimeout(() => {
        console.log('[Sandbox] 检查脚本初始化状态...');
        console.log('[Sandbox] isInitedApi:', (globalThis as any).isInitedApi);
        console.log('[Sandbox] initError:', (globalThis as any).initError);
        console.log('[Sandbox] _sources:', (globalThis as any)._sources);
        console.log('[Sandbox] _registeredSources:', (globalThis as any)._registeredSources);
        console.log('[Sandbox] events.request:', typeof (globalThis as any).events?.request);
        
        // 如果脚本没有正确初始化，尝试手动触发初始化
        if (!(globalThis as any).isInitedApi && !(globalThis as any).initError) {
          console.log('[Sandbox] 尝试手动触发脚本初始化...');
          try {
            if ((globalThis as any)._handleInit) {
              (globalThis as any)._handleInit({
                sources: {
                  kw: { type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit'] },
                  kg: { type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit'] },
                  tx: { type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit'] },
                  wy: { type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit'] },
                  mg: { type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit'] },
                  local: { type: 'music', actions: ['musicUrl', 'lyric', 'pic'], qualitys: [] }
                }
              }).then(() => {
                console.log('[Sandbox] 手动初始化完成');
                (globalThis as any).isInitedApi = true;
                (globalThis as any).isInited = true;
              }).catch((error: any) => {
                console.error('[Sandbox] 手动初始化失败:', error);
                (globalThis as any).initError = error.message;
              });
            }
          } catch (error: any) {
            console.error('[Sandbox] 手动初始化异常:', error);
          }
        }
      }, 1000);

      this.isInitialized = true;
      console.log('[Sandbox] 脚本初始化完成:', this.scriptInfo.name);
      console.log('[Sandbox] 已注册音源:', JSON.stringify((globalThis as any)._sources ? Object.keys((globalThis as any)._sources) : []));
      console.log('[Sandbox] events.request 是否存在:', typeof (globalThis as any).events?.request);
      console.log('[Sandbox] lx.send 是否存在:', typeof (globalThis as any).lx?.send);
      console.log('[Sandbox] lx.on 是否存在:', typeof (globalThis as any).lx?.on);
      console.log('[Sandbox] initError:', (globalThis as any).initError);
      console.log('[Sandbox] isInitedApi:', (globalThis as any).isInitedApi);
    } catch (error) {
      console.error('Sandbox 初始化失败: ' + this.scriptInfo.name, error);
    }
  }

  private handleInit(info: any): Promise<void> {
    console.log('[Sandbox] handleInit called:', info);
    return new Promise((resolve) => {
      const sourceInfo = { sources: {} };
      const allSources = ['kw', 'kg', 'tx', 'wy', 'mg', 'local'];
      const supportQualitys = {
        kw: ['128k', '320k', 'flac', 'flac24bit'],
        kg: ['128k', '320k', 'flac', 'flac24bit'],
        tx: ['128k', '320k', 'flac', 'flac24bit'],
        wy: ['128k', '320k', 'flac', 'flac24bit'],
        mg: ['128k', '320k', 'flac', 'flac24bit'],
        local: [],
      };
      const supportActions = {
        kw: ['musicUrl'],
        kg: ['musicUrl'],
        tx: ['musicUrl'],
        wy: ['musicUrl'],
        mg: ['musicUrl'],
        xm: ['musicUrl'],
        local: ['musicUrl', 'lyric', 'pic'],
      };

      try {
        if (!info || !info.sources) {
          console.log('[Sandbox] 脚本未提供音源信息，使用默认音源');
          for (let i = 0; i < allSources.length; i++) {
            const source = allSources[i];
            sourceInfo.sources[source] = {
              type: 'music',
              actions: supportActions[source] || [],
              qualitys: supportQualitys[source] || [],
            };
          }
        } else {
          for (let i = 0; i < allSources.length; i++) {
            const source = allSources[i];
            const userSource = info.sources && info.sources[source];
            if (!userSource || userSource.type !== 'music') continue;
            const qualitys = supportQualitys[source];
            const actions = supportActions[source];
            sourceInfo.sources[source] = {
              type: 'music',
              actions: actions.filter((a: string) => userSource.actions.includes(a)),
              qualitys: qualitys.filter((q: string) => userSource.qualitys.includes(q)),
            };
          }
        }
        
        console.log('[Sandbox] 注册的音源:', Object.keys(sourceInfo.sources));
        (globalThis as any)._registeredSources = sourceInfo.sources;
        (globalThis as any)._sources = sourceInfo.sources;
        resolve();
      } catch (error) {
        console.error('[Sandbox] 初始化失败:', error);
        resolve();
      }
    });
  }

  private handleUpdateAlert(data: any): Promise<void> {
    console.log('[Sandbox] handleUpdateAlert called:', data);
    return Promise.resolve();
  }

  async handleRequest(data: MusicUrlRequest): Promise<MusicUrlResponse | null> {
    console.log('[Sandbox] handleRequest called:', data);
    
    if (!this.isInitialized) {
      console.log('[Sandbox] 脚本未初始化');
      return null;
    }

    try {
      const handler = (globalThis as any).events?.request;
      if (!handler) {
        console.log('[Sandbox] Request event is not defined');
        throw new Error('Request event is not defined');
      }

      console.log('[Sandbox] 调用脚本请求处理器...');
      const result = await handler({ source: data.source, action: data.action, info: data.info });
      console.log('[Sandbox] 脚本返回结果:', result);

      if (data.action === 'musicUrl') {
        if (typeof result !== 'string' || result.length > 2048 || !/^https?:/.test(result)) {
          console.log('[Sandbox] 无效的音乐URL:', result);
          throw new Error('Invalid music URL');
        }
        return {
          source: data.source,
          action: data.action,
          data: {
            type: data.info.type,
            url: result,
          },
        };
      } else if (data.action === 'lyric') {
        if (typeof result !== 'object' || typeof result.lyric !== 'string') {
          console.log('[Sandbox] 无效的歌词数据:', result);
          throw new Error('Invalid lyric data');
        }
        if (result.lyric.length > 51200) {
          console.log('[Sandbox] 歌词过长:', result.lyric.length);
          throw new Error('Lyric too long');
        }
        return {
          source: data.source,
          action: data.action,
          data: {
            type: 'lyric',
            lyric: result.lyric,
            tlyric: (typeof result.tlyric == 'string' && result.tlyric.length < 5120) ? result.tlyric : null,
            rlyric: (typeof result.rlyric == 'string' && result.rlyric.length < 5120) ? result.rlyric : null,
            lxlyric: (typeof result.lxlyric == 'string' && result.lxlyric.length < 8192) ? result.lxlyric : null,
          },
        };
      } else if (data.action === 'pic') {
        if (typeof result !== 'string' || result.length > 2048 || !/^https?:/.test(result)) {
          console.log('[Sandbox] 无效的图片URL:', result);
          throw new Error('Invalid pic URL');
        }
        return {
          source: data.source,
          action: data.action,
          data: {
            type: 'pic',
            url: result,
          },
        };
      }

      return null;
    } catch (error) {
      console.error('[Sandbox] Request 处理失败:', error);
      switch (data.action) {
        case 'musicUrl':
          return { source: data.source, action: data.action, data: { type: 'musicUrl', url: '' } };
        case 'lyric':
          return { source: data.source, action: data.action, data: { type: 'lyric', lyric: '', tlyric: null, rlyric: null, lxlyric: null } };
        case 'pic':
          return { source: data.source, action: data.action, data: { type: 'pic', url: '' } };
        default:
          return null;
      }
    }
  }

  async request(data: MusicUrlRequest): Promise<MusicUrlResponse | null> {
    return this.handleRequest(data);
  }

  getRegisteredSources(): string[] {
    const sources = (globalThis as any)._registeredSources;
    if (sources) return Object.keys(sources);
    return ['kw', 'kg', 'tx', 'wy', 'mg'];
  }

  getRegisteredSourceList(): string[] {
    return this.getRegisteredSources();
  }

  supportsSource(source: string): boolean {
    const sources = (globalThis as any)._sources;
    if (sources) return source in sources;
    return ['kw', 'kg', 'tx', 'wy', 'mg'].includes(source);
  }

  setSourceHandler(source: string, handler: any): void {
    this.registeredSources.set(source, handler);
  }

  async terminate(): Promise<void> {
    this.isInitialized = false;
    this.registeredSources.clear();
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}