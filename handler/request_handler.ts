import { ScriptEngine, MusicUrlData, LyricData } from "../engine/script_engine.ts";
import { ScriptStorage } from "../storage/storage.ts";

interface RequestData {
  requestKey: string;
  data: {
    source: string;
    action: string;
    info: any;
  };
}

interface ResponseData {
  status: boolean;
  message?: string;
  data?: any;
}

export class RequestHandler {
  private engine: ScriptEngine;
  private storage: ScriptStorage;
  private requestQueue: Map<string, [Function, Function]> = new Map();
  private timeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly REQUEST_TIMEOUT = 60000;

  constructor(engine: ScriptEngine, storage: ScriptStorage) {
    this.engine = engine;
    this.storage = storage;
  }

  async handleRequest(requestData: RequestData): Promise<ResponseData> {
    const { requestKey, data } = requestData;
    const { source, action, info } = data;
    
    console.log('[RequestHandler] handleRequest called:', JSON.stringify({ requestKey, source, action, info }, null, 2));
    
    await this.storage.ready();

    const timeoutKey = requestKey;
    if (this.timeouts.has(timeoutKey)) {
      clearTimeout(this.timeouts.get(timeoutKey));
    }

    this.timeouts.set(timeoutKey, setTimeout(() => {
      this.cancelRequest(timeoutKey);
    }, this.REQUEST_TIMEOUT));

    try {
      let result: any;

      switch (action) {
        case 'musicUrl':
          result = await this.handleMusicUrl(source, info);
          break;

        case 'lyric':
          result = await this.handleLyric(source, info);
          break;

        case 'pic':
          result = await this.handlePic(source, info);
          break;

        default:
          throw new Error(`Unsupported action: ${action}`);
      }

      clearTimeout(this.timeouts.get(timeoutKey));
      this.timeouts.delete(timeoutKey);

      return {
        status: true,
        data: {
          requestKey,
          result,
        },
      };
    } catch (error: any) {
      clearTimeout(this.timeouts.get(timeoutKey));
      this.timeouts.delete(timeoutKey);

      return {
        status: false,
        message: error.message,
      };
    }
  }

  private async handleMusicUrl(source: string, info: any): Promise<any> {
    console.log('[RequestHandler] handleMusicUrl called with source:', source, 'info:', JSON.stringify(info, null, 2));
    
    const defaultSourceId = this.storage.getDefaultSource();
    let targetSource: string | null = source || defaultSourceId || null;
    let sourceType = source;
    
    // 如果没有指定源，使用默认源
    if (!targetSource && defaultSourceId) {
      targetSource = defaultSourceId;
      sourceType = defaultSourceId;
      
      // 获取默认源的详细信息
      const allScripts = this.storage.getLoadedScripts();
      const defaultScript = allScripts.find(script => script.id === defaultSourceId);
      
      if (defaultScript && defaultScript.supportedSources.length > 0) {
        // 使用默认源支持的第一个音源类型
        sourceType = defaultScript.supportedSources[0];
      }
    }
    
    if (!targetSource) {
      throw new Error(`No available script for source: ${source}`);
    }

    if (!(targetSource as string).startsWith('user_api_')) {
      const allScripts = this.storage.getLoadedScripts();
      const targetScript = allScripts.find(script => {
        return script.supportedSources.includes(targetSource as string);
      });
      
      if (!targetScript) {
        throw new Error(`No available script for source: ${source}`);
      }
      
      targetSource = targetScript.id;
    } else {
      const allScripts = this.storage.getLoadedScripts();
      const targetScript = allScripts.find(script => 
        script.id === targetSource
      );
      
      if (!targetScript) {
        throw new Error(`No available script for source: ${source}`);
      }
      
      sourceType = targetScript.supportedSources[0];
    }
    
    const musicInfo = {
      id: info.id || info.musicInfo?.id || '',
      name: info.name || info.musicInfo?.name || '未知歌曲',
      singer: info.singer || info.musicInfo?.singer || '未知歌手',
      source: info.source || sourceType,
      interval: info.interval || info.musicInfo?.interval || null,
      songmid: info.hash || info.songmid || info.musicInfo?.hash || info.musicInfo?.songmid || '',
      meta: {
        songId: info.songId || info.musicInfo?.songId || '',
        albumName: info.albumName || info.musicInfo?.albumName || '',
        picUrl: info.picUrl || info.musicInfo?.picUrl || null,
        hash: info.hash || info.songmid || info.musicInfo?.hash || info.musicInfo?.songmid || '',
        strMediaMid: info.strMediaMid || info.musicInfo?.strMediaMid || undefined,
        copyrightId: info.copyrightId || info.musicInfo?.copyrightId || undefined
      }
    };

    const response = await this.engine.getMusicUrl({
      source: sourceType,
      action: 'musicUrl',
      info: {
        type: info.type || 'music',
        musicInfo: musicInfo
      },
    });
    
    if (!response || !response.data) {
      throw new Error(`Failed to get music URL: source=${sourceType}`);
    }

    const responseData = response.data as MusicUrlData;
    
    if (!responseData.url) {
      throw new Error(`Music URL is empty: source=${sourceType}`);
    }
    
    return {
      type: info.type || 'music',
      url: responseData.url,
    };
  }

  private async handleLyric(source: string, info: any): Promise<any> {
    const response = await this.engine.getLyric({
      source,
      action: 'lyric',
      info,
    });

    if (!response) {
      throw new Error('Failed to get lyric');
    }

    const responseData = response.data as LyricData;
    
    return {
      lyric: responseData.lyric,
      tlyric: responseData.tlyric,
      rlyric: responseData.rlyric,
      lxlyric: responseData.lxlyric,
    };
  }

  private async handlePic(source: string, info: any): Promise<string> {
    const response = await this.engine.getPic({
      source,
      action: 'pic',
      info,
    });

    if (!response || !response.data) {
      throw new Error('Failed to get pic URL');
    }

    const picData = response.data as { url: string };
    return picData.url;
  }

  cancelRequest(requestKey: string): void {
    const request = this.requestQueue.get(requestKey);
    if (request) {
      request[1](new Error('Request cancelled'));
      this.requestQueue.delete(requestKey);
    }

    if (this.timeouts.has(requestKey)) {
      clearTimeout(this.timeouts.get(requestKey));
      this.timeouts.delete(requestKey);
    }
  }

  getActiveRequestCount(): number {
    return this.requestQueue.size;
  }

  async cleanup(): Promise<void> {
    for (const [requestKey, [, reject]] of this.requestQueue) {
      reject(new Error('Server shutting down'));
    }
    this.requestQueue.clear();

    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
  }
}
