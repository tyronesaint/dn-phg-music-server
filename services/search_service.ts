const log = (message: string, ...args: any[]) => {
  console.log(`[SearchService] ${message}`, ...args);
};

interface MusicInfo {
  id?: string;
  name?: string;
  singer?: string;
  album?: string;
  source?: string;
  interval?: number;
  hash?: string;
  songmid?: string;
  songId?: string;
  FileHash?: string;
  artistids?: string[];
  albumid?: string;
  singerid?: string[];
}

interface SearchResult {
  id: string;
  name: string;
  singer: string;
  album: string;
  source: string;
  interval: number;
  hash: string;
  musicInfo: MusicInfo;
}

interface SearchResponse {
  platform: string;
  name: string;
  keyword: string;
  page: number;
  results: SearchResult[];
  error?: string;
}

export class SearchService {
  private platforms = {
    kw: { name: '酷我音乐', enabled: true },
    kg: { name: '酷狗音乐', enabled: true },
    tx: { name: 'QQ音乐', enabled: true },
    wy: { name: '网易云音乐', enabled: true },
    mg: { name: '咪咕音乐', enabled: true }
  };

  getSupportedPlatforms() {
    return Object.entries(this.platforms).map(([id, info]) => ({
      id,
      name: info.name,
      enabled: info.enabled
    }));
  }

  async searchKw(keyword: string, page = 1, limit = 20): Promise<SearchResponse> {
    try {
      log('[Search] Searching Kuwo Music for:', keyword);
      
      const url = `http://search.kuwo.cn/r.s`;
      const params = new URLSearchParams({
        client: 'kt',
        all: encodeURIComponent(keyword),
        pn: (page - 1).toString(),
        rn: limit.toString(),
        uid: '794762570',
        ver: 'kwplayer_ar_9.2.2.1',
        vipver: '1',
        show_copyright_off: '1',
        newver: '1',
        ft: 'music',
        cluster: '0',
        strategy: '2012',
        encoding: 'utf8',
        rformat: 'json',
        vermerge: '1',
        mobi: '1',
        issubtitle: '1'
      });
      
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': `http://search.kuwo.cn/`,
          'Accept': '*/*',
          'Connection': 'keep-alive',
          'Accept-Language': 'zh-CN,zh;q=0.9'
        }
      });
      
      const data = await response.json();
      
      if (!data || (data.TOTAL !== '0' && data.SHOW === '0')) {
        return {
          platform: 'kw',
          name: '酷我音乐',
          keyword,
          page,
          results: []
        };
      }
      
      const results: SearchResult[] = (data.abslist || []).map((item: any) => {
        const rid = item.MUSICRID?.replace('MUSIC_', '') || item.id;
        return {
          id: rid,
          name: item.SONGNAME || '',
          singer: item.ARTIST || '',
          album: item.ALBUM || '',
          source: 'kw',
          interval: parseInt(item.DURATION || 0),
          hash: rid,
          musicInfo: {
            id: item.id || rid,
            name: item.SONGNAME || '',
            singer: item.ARTIST || '',
            album: item.ALBUM || '',
            duration: parseInt(item.DURATION || 0),
            songmid: rid,
            hash: rid,
            albumid: item.ALBUMID || ''
          }
        };
      });
      
      return {
        platform: 'kw',
        name: '酷我音乐',
        keyword,
        page,
        results
      };
    } catch (error: any) {
      log('[Search] Kuwo Music search error:', error);
      return {
        platform: 'kw',
        name: '酷我音乐',
        keyword,
        page,
        results: [],
        error: error.message
      };
    }
  }

  async searchKg(keyword: string, page = 1, limit = 20): Promise<SearchResponse> {
    try {
      log('[Search] Searching Kugou Music for:', keyword);
      
      const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&platform=WebFilter`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      const data = await response.json();
      
      if (data.status !== 1 || !data.data || !data.data.lists) {
        return {
          platform: 'kg',
          name: '酷狗音乐',
          keyword,
          page,
          results: []
        };
      }
      
      const results: SearchResult[] = data.data.lists.map((item: any) => {
        const fileHash = item.FileHash;
        return {
          id: fileHash,
          name: item.SongName,
          singer: item.SingerName,
          album: item.AlbumName,
          source: 'kg',
          interval: item.Duration || 0,
          hash: fileHash,
          musicInfo: {
            FileHash: fileHash,
            songId: fileHash,
            name: item.SongName,
            singer: item.SingerName,
            album: item.AlbumName,
            duration: item.Duration || 0,
            songmid: fileHash,
            hash: fileHash
          }
        };
      });
      
      return {
        platform: 'kg',
        name: '酷狗音乐',
        keyword,
        page,
        results
      };
    } catch (error: any) {
      log('[Search] Kugou Music search error:', error);
      return {
        platform: 'kg',
        name: '酷狗音乐',
        keyword,
        page,
        results: [],
        error: error.message
      };
    }
  }

  async searchTx(keyword: string, page = 1, limit = 20): Promise<SearchResponse> {
    try {
      log('[Search] Searching QQ Music for:', keyword);
      
      const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?new_json=1&w=${encodeURIComponent(keyword)}&p=${page}&n=${limit}&format=json&platform=h5`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://y.qq.com/'
        }
      });
      
      const data = await response.json();
      
      if (!data.data || !data.data.song || !data.data.song.list) {
        return {
          platform: 'tx',
          name: 'QQ音乐',
          keyword,
          page,
          results: []
        };
      }
      
      const results: SearchResult[] = data.data.song.list.map((item: any) => {
        const songmid = item.mid || item.songmid;
        return {
          id: songmid,
          name: item.name,
          singer: item.singer.map((s: any) => s.name).join(','),
          album: item.album.name,
          source: 'tx',
          interval: item.interval || 0,
          hash: songmid,
          musicInfo: {
            songmid: songmid,
            id: item.id,
            name: item.name,
            singer: item.singer.map((s: any) => s.name).join(','),
            album: item.album.name,
            interval: item.interval || 0,
            duration: item.interval || 0,
            singerid: item.singer.map((s: any) => s.mid),
            albumid: item.album.mid,
            hash: songmid
          }
        };
      });
      
      return {
        platform: 'tx',
        name: 'QQ音乐',
        keyword,
        page,
        results
      };
    } catch (error: any) {
      log('[Search] QQ Music search error:', error);
      return {
        platform: 'tx',
        name: 'QQ音乐',
        keyword,
        page,
        results: [],
        error: error.message
      };
    }
  }

  async searchWy(keyword: string, page = 1, limit = 20): Promise<SearchResponse> {
    try {
      log('[Search] Searching NetEase Cloud Music for:', keyword);
      
      const offset = (page - 1) * limit;
      const url = `https://music.163.com/api/search/pc`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Referer': 'https://music.163.com/',
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Connection': 'keep-alive',
          'Accept-Language': 'zh-CN,zh;q=0.9'
        },
        body: new URLSearchParams({
          s: encodeURIComponent(keyword),
          type: '1',
          offset: offset.toString(),
          limit: limit.toString()
        })
      });
      
      const data = await response.json();
      
      if (!data || data.code !== 200 || !data.result || !data.result.songs) {
        return {
          platform: 'wy',
          name: '网易云音乐',
          keyword,
          page,
          results: []
        };
      }
      
      const results: SearchResult[] = data.result.songs.map((item: any) => {
        const songId = item.id;
        return {
          id: songId.toString(),
          name: item.name,
          singer: item.artists.map((a: any) => a.name).join(','),
          album: item.album.name,
          source: 'wy',
          interval: Math.round(item.duration / 1000) || 0,
          hash: songId.toString(),
          musicInfo: {
            id: songId,
            name: item.name,
            singer: item.artists.map((a: any) => a.name).join(','),
            album: item.album.name,
            duration: Math.round(item.duration / 1000) || 0,
            interval: Math.round(item.duration / 1000) || 0,
            songmid: songId.toString(),
            hash: songId.toString(),
            artistids: item.artists.map((a: any) => a.id),
            albumid: item.album.id
          }
        };
      });
      
      return {
        platform: 'wy',
        name: '网易云音乐',
        keyword,
        page,
        results
      };
    } catch (error: any) {
      log('[Search] NetEase Cloud Music search error:', error);
      return {
        platform: 'wy',
        name: '网易云音乐',
        keyword,
        page,
        results: [],
        error: error.message
      };
    }
  }

  async searchMg(keyword: string, page = 1, limit = 20): Promise<SearchResponse> {
    try {
      log('[Search] Searching Migu Music for:', keyword);
      
      const url = `https://m.music.migu.cn/migumusic/h5/search/all`;
      const params = new URLSearchParams({
        keyword: keyword,
        type: '2',
        pageNo: page.toString(),
        pageSize: limit.toString()
      });
      
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Referer': 'https://m.music.migu.cn/',
          'Accept': 'application/json',
          'Connection': 'keep-alive',
          'Accept-Language': 'zh-CN,zh;q=0.9'
        }
      });
      
      const data = await response.json();
      
      if (!data || !data.songResultData || !data.songResultData.result) {
        return {
          platform: 'mg',
          name: '咪咕音乐',
          keyword,
          page,
          results: []
        };
      }
      
      const results: SearchResult[] = data.songResultData.result.map((item: any) => {
        const copyrightId = item.copyrightId;
        return {
          id: copyrightId,
          name: item.songName,
          singer: item.singers.map((s: any) => s.name).join(','),
          album: item.albumName,
          source: 'mg',
          interval: item.duration || 0,
          hash: copyrightId,
          musicInfo: {
            copyrightId: copyrightId,
            id: copyrightId,
            name: item.songName,
            singer: item.singers.map((s: any) => s.name).join(','),
            album: item.albumName,
            duration: item.duration || 0,
            interval: item.duration || 0,
            songmid: copyrightId,
            hash: copyrightId
          }
        };
      });
      
      return {
        platform: 'mg',
        name: '咪咕音乐',
        keyword,
        page,
        results
      };
    } catch (error: any) {
      log('[Search] Migu Music search error:', error);
      return {
        platform: 'mg',
        name: '咪咕音乐',
        keyword,
        page,
        results: [],
        error: error.message
      };
    }
  }

  async search(keyword: string, source?: string, page = 1, limit = 20): Promise<SearchResponse[]> {
    const sources = source ? [source] : Object.keys(this.platforms);
    const results: SearchResponse[] = [];
    
    for (const src of sources) {
      if (!this.platforms[src as keyof typeof this.platforms]?.enabled) {
        continue;
      }
      
      let result: SearchResponse;
      switch (src) {
        case 'kw':
          result = await this.searchKw(keyword, page, limit);
          break;
        case 'kg':
          result = await this.searchKg(keyword, page, limit);
          break;
        case 'tx':
          result = await this.searchTx(keyword, page, limit);
          break;
        case 'wy':
          result = await this.searchWy(keyword, page, limit);
          break;
        case 'mg':
          result = await this.searchMg(keyword, page, limit);
          break;
        default:
          continue;
      }
      
      results.push(result);
    }
    
    return results;
  }
}
