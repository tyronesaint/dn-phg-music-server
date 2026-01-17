import { Sandbox } from "./sandbox.ts";
import { LXGlobal } from "./lx_global.ts";
import { RequestManager } from "./request_manager.ts";

export interface ScriptInfo {
  id: string;
  name: string;
  description: string;
  author: string;
  homepage: string;
  version: string;
  rawScript: string;
  supportedSources: string[];
}

export interface MusicUrlRequest {
  source: string;
  action: string;
  info: {
    type: string;
    musicInfo: {
      id: string;
      name: string;
      singer: string;
      source: string;
      interval: string | null;
      meta: {
        songId: string | number;
        albumName: string;
        picUrl?: string | null;
        hash?: string;
        strMediaMid?: string;
        copyrightId?: string;
      };
    };
  };
}

export interface MusicUrlData {
  type: string;
  url: string;
}

export interface LyricData {
  type: string;
  lyric: string;
  tlyric: string | null;
  rlyric: string | null;
  lxlyric: string | null;
}

export interface PicData {
  type: string;
  url: string;
}

export interface MusicUrlResponse {
  source: string;
  action: string;
  data: MusicUrlData | LyricData | PicData;
}

export class ScriptEngine {
  private sandboxes: Map<string, Sandbox> = new Map();
  private requestManager: RequestManager;
  private activeScripts: Map<string, ScriptInfo> = new Map();
  private storage: any;

  constructor(storage?: any) {
    this.requestManager = new RequestManager();
    this.storage = storage;
  }

  async loadScript(scriptInfo: ScriptInfo): Promise<boolean> {
    try {
      const sandbox = new Sandbox(scriptInfo, this.requestManager);

      await sandbox.initialize();
      
      const registeredSources = sandbox.getRegisteredSourceList();
      
      let finalSources: string[];
      
      if (registeredSources.length > 0) {
        finalSources = registeredSources;
      } else {
        const fallbackSources = this.getFallbackSourcesForScript(scriptInfo);
        if (fallbackSources.length > 0) {
          finalSources = fallbackSources;
        } else {
          finalSources = [];
        }
      }
      
      if (finalSources.length > 0) {
        scriptInfo.supportedSources = finalSources;
        
        for (const source of finalSources) {
          if (!sandbox.supportsSource(source)) {
            sandbox.setSourceHandler(source, async(request: MusicUrlRequest) => {
              return this.handleScriptRequest(sandbox, request);
            });
          }
        }
        
        if (this.storage) {
          await this.storage.updateScriptSupportedSources(scriptInfo.id, finalSources);
        }
      }

      this.sandboxes.set(scriptInfo.id, sandbox);
      this.activeScripts.set(scriptInfo.id, scriptInfo);

      return true;
    } catch (error) {
      return false;
    }
  }

  async unloadScript(scriptId: string): Promise<void> {
    const sandbox = this.sandboxes.get(scriptId);
    if (sandbox) {
      await sandbox.terminate();
      this.sandboxes.delete(scriptId);
      this.activeScripts.delete(scriptId);
    }
  }

  async getMusicUrl(request: MusicUrlRequest): Promise<MusicUrlResponse> {
    const { source, info } = request;

    const triedScripts: string[] = [];

    for (const [scriptId, sandbox] of this.sandboxes) {
      try {
        if (sandbox.supportsSource(source)) {
          triedScripts.push(scriptId);
          const response = await sandbox.request(request);
          if (response && response.data && request.action === 'musicUrl' && (response.data as MusicUrlData).url) {
            return response;
          }
        }
      } catch (error: any) {
        if (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('API') || error.message.includes('服务器')) {
          continue;
        }
        throw error;
      }
    }

    if (triedScripts.length > 0) {
      throw new Error(`所有可用脚本都执行失败: ${triedScripts.join(', ')}。请检查API服务器状态。`);
    }

    throw new Error(`No available script for source: ${source}`);
  }

  async getLyric(request: any): Promise<any> {
    const { source, info } = request;

    for (const [scriptId, sandbox] of this.sandboxes) {
      try {
        if (sandbox.supportsSource(source)) {
          const response = await sandbox.request(request);
          if (response) {
            return response;
          }
        }
      } catch (error) {
      }
    }

    throw new Error(`No available script for source: ${source}`);
  }

  async getPic(request: any): Promise<MusicUrlResponse> {
    const { source, info } = request;

    for (const [scriptId, sandbox] of this.sandboxes) {
      try {
        if (sandbox.supportsSource(source)) {
          const response = await sandbox.request(request);
          if (response) {
            return response;
          }
        }
      } catch (error) {
      }
    }

    throw new Error(`No available script for source: ${source}`);
  }

  getActiveScripts(): ScriptInfo[] {
    return Array.from(this.activeScripts.values());
  }

  getScript(scriptId: string): Sandbox | undefined {
    return this.sandboxes.get(scriptId);
  }

  async terminate(): Promise<void> {
    for (const sandbox of this.sandboxes.values()) {
      await sandbox.terminate();
    }
    this.sandboxes.clear();
    this.activeScripts.clear();
  }

  private getFallbackSourcesForScript(scriptInfo: ScriptInfo): string[] {
    const scriptName = scriptInfo.name.toLowerCase();
    const scriptId = scriptInfo.id.toLowerCase();
    
    if (scriptName.includes('flower') || scriptName.includes('野花')) {
      return ['kw', 'kg', 'tx', 'wy', 'mg'];
    }
    
    if (scriptId.includes('flower')) {
      return ['kw', 'kg', 'tx', 'wy', 'mg'];
    }
    
    return [];
  }

  private async handleScriptRequest(sandbox: Sandbox, request: MusicUrlRequest): Promise<MusicUrlResponse> {
    const { source, action, info } = request;
    
    try {
      const response = await sandbox.request(request);
      
      if (response && response.data) {
        return response;
      }
      
      return {
        source,
        action,
        data: { type: 'music', url: '', lyric: '' } as MusicUrlData | LyricData | PicData,
      };
    } catch (error) {
      throw error;
    }
  }
}
