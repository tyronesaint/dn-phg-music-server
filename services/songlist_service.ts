// 歌单服务 - 参考 lx-music-desktop 实现
// 支持平台: 网易云(wy), QQ音乐(tx), 酷狗(kg), 酷我(kw), 咪咕(mg)

import { linuxapi } from "../utils/crypto.ts";
import { md5 } from "../utils/md5.ts";

// 日志工具
const log = {
  debug: (...args: any[]) => console.log("[SongList]", ...args),
  info: (...args: any[]) => console.log("[SongList]", ...args),
  warn: (...args: any[]) => console.warn("[SongList]", ...args),
  error: (...args: any[]) => console.error("[SongList]", ...args),
};

// 歌曲信息接口
export interface SongInfo {
  id: string;
  name: string;
  singer: string;
  albumName: string;
  albumId?: string;
  interval: string;
  source: string;
  songmid?: string;
  hash?: string;
  songId?: string;
  copyrightId?: string;
  strMediaMid?: string;
  img?: string;
}

// 歌单信息接口
export interface SongListInfo {
  name: string;
  img: string;
  desc: string;
  author: string;
  play_count: string;
}

// 歌单详情结果
export interface SongListResult {
  list: SongInfo[];
  page: number;
  limit: number;
  total: number;
  source: string;
  info: SongListInfo;
}

// ==================== 网易云音乐歌单服务 ====================
class NeteaseSongListService {
  private static readonly API_URL = "https://music.163.com/api/linux/forward";
  private static readonly SUCCESS_CODE = 200;

  // 解析歌单ID
  private parseListId(input: string): string {
    // 支持格式:
    // https://music.163.com/playlist?id=123456
    // https://music.163.com/#/playlist?id=123456
    const regExp = /[?&]id=(\d+)/;
    if (regExp.test(input)) {
      return input.replace(regExp, "$1");
    }
    return input;
  }

  // 格式化播放次数
  private formatPlayCount(count: number): string {
    if (count > 10000) {
      return (count / 10000).toFixed(1) + "万";
    }
    return String(count);
  }

  // 格式化播放时间
  private formatPlayTime(interval: number): string {
    const m = Math.floor(interval / 60).toString().padStart(2, "0");
    const s = (interval % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // 获取歌曲详情（用于获取完整的歌曲信息）
  private async getMusicDetail(ids: number[]): Promise<any[]> {
    if (ids.length === 0) return [];
    
    try {
      // 使用 linuxapi 获取歌曲详情
      const encrypted = linuxapi({
        method: "POST",
        url: "https://music.163.com/api/v3/song/detail",
        params: {
          c: '[' + ids.map(id => ('{"id":' + id + '}')).join(',') + ']',
        },
      });
      
      const response = await fetch(NeteaseSongListService.API_URL, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(encrypted),
      });

      if (!response.ok) {
        throw new Error(`获取歌曲详情失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.code !== NeteaseSongListService.SUCCESS_CODE) {
        throw new Error("获取歌曲详情失败");
      }

      return data.songs || [];
    } catch (error: any) {
      log.error("获取歌曲详情失败:", error.message);
      return [];
    }
  }

  // 获取歌单详情
  async getListDetail(rawId: string): Promise<SongListResult> {
    const id = this.parseListId(rawId);
    log.info("获取网易云歌单详情, id:", id);

    try {
      // 使用 linuxapi 加密 (同步函数)
      const encrypted = linuxapi({
        method: "POST",
        url: "https://music.163.com/api/v3/playlist/detail",
        params: {
          id: parseInt(id),
          n: 100000,
          s: 8,
        },
      });

      const response = await fetch(NeteaseSongListService.API_URL, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(encrypted),
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const data = await response.json();

      if (data.code !== NeteaseSongListService.SUCCESS_CODE || !data.playlist) {
        throw new Error("获取歌单失败");
      }

      const playlist = data.playlist;
      const privileges = data.privileges || [];
      const trackIds = playlist.trackIds || [];
      
      let list: SongInfo[] = [];
      
      // 判断是否需要分批获取歌曲详情
      // 如果 trackIds 长度和 privileges 长度相等，说明 tracks 已经包含全部歌曲
      if (trackIds.length === privileges.length && playlist.tracks.length === trackIds.length) {
        // 直接从 tracks 中获取全部歌曲
        list = playlist.tracks.map((item: any, index: number) => {
          const privilege = privileges[index] || {};
          return {
            id: String(item.id),
            name: item.name,
            singer: item.ar?.map((a: any) => a.name).join("、") || "",
            albumName: item.al?.name || "",
            albumId: String(item.al?.id || ""),
            interval: this.formatPlayTime(Math.floor(item.dt / 1000)),
            source: "wy",
            songmid: String(item.id),
            img: item.al?.picUrl || "",
          };
        });
      } else {
        // 需要分批获取歌曲详情
        // 每次获取 1000 首，分批获取全部
        const batchSize = 1000;
        for (let i = 0; i < trackIds.length; i += batchSize) {
          const batchTrackIds = trackIds.slice(i, i + batchSize);
          const ids = batchTrackIds.map((t: any) => t.id);
          const songs = await this.getMusicDetail(ids);
          
          const batchList = songs.map((item: any) => ({
            id: String(item.id),
            name: item.name,
            singer: item.ar?.map((a: any) => a.name).join("、") || "",
            albumName: item.al?.name || "",
            albumId: String(item.al?.id || ""),
            interval: this.formatPlayTime(Math.floor(item.dt / 1000)),
            source: "wy",
            songmid: String(item.id),
            img: item.al?.picUrl || "",
          }));
          
          list = list.concat(batchList);
        }
      }

      return {
        list,
        page: 1,
        limit: list.length,
        total: list.length,
        source: "wy",
        info: {
          name: playlist.name,
          img: playlist.coverImgUrl,
          desc: playlist.description || "",
          author: playlist.creator?.nickname || "",
          play_count: this.formatPlayCount(playlist.playCount),
        },
      };
    } catch (error: any) {
      log.error("获取网易云歌单失败:", error.message);
      throw error;
    }
  }
}

// ==================== QQ音乐歌单服务 ====================
class QQMusicSongListService {
  private static readonly SUCCESS_CODE = 0;

  // 解析歌单ID
  private parseListId(input: string): string {
    // 支持格式:
    // https://y.qq.com/n/yqq/playlist/123456.html
    // https://i.y.qq.com/n2/m/share/details/taoge.html?id=123456
    const regExp1 = /\/playlist\/(\d+)/;
    const regExp2 = /[?&]id=(\d+)/;
    
    if (regExp1.test(input)) {
      return input.replace(regExp1, "$1");
    }
    if (regExp2.test(input)) {
      return input.replace(regExp2, "$1");
    }
    return input;
  }

  // 格式化播放次数
  private formatPlayCount(count: number): string {
    if (count > 10000) {
      return (count / 10000).toFixed(1) + "万";
    }
    return String(count);
  }

  // 格式化播放时间
  private formatPlayTime(interval: number): string {
    const m = Math.floor(interval / 60).toString().padStart(2, "0");
    const s = (interval % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // HTML 解码
  private decodeName(name: string): string {
    return name
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/")
      .replace(/&#x60;/g, "`")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  }

  // 获取歌单详情
  async getListDetail(rawId: string, page: number = 1): Promise<SongListResult> {
    const id = this.parseListId(rawId);
    log.info("获取QQ音乐歌单详情, id:", id);

    try {
      const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${id}&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`;

      const response = await fetch(url, {
        headers: {
          "Origin": "https://y.qq.com",
          "Referer": `https://y.qq.com/n/yqq/playsquare/${id}.html`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const data = await response.json();

      if (data.code !== QQMusicSongListService.SUCCESS_CODE || !data.cdlist || data.cdlist.length === 0) {
        throw new Error("获取歌单失败");
      }

      const cdlist = data.cdlist[0];

      // 解析歌曲列表
      const list: SongInfo[] = cdlist.songlist.map((item: any) => {
        return {
          id: String(item.id),
          name: item.title,
          singer: item.singer?.map((s: any) => s.name).join("、") || "",
          albumName: item.album?.name || "",
          albumId: item.album?.mid || "",
          interval: this.formatPlayTime(item.interval),
          source: "tx",
          songmid: item.mid,
          songId: String(item.id),
          strMediaMid: item.file?.media_mid || "",
          img: item.album?.name
            ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${item.album.mid}.jpg`
            : (item.singer?.length ? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg` : ""),
        };
      });

      return {
        list,
        page: 1,
        limit: list.length + 1,
        total: cdlist.songlist.length,
        source: "tx",
        info: {
          name: cdlist.dissname,
          img: cdlist.logo,
          desc: this.decodeName(cdlist.desc).replace(/<br>/g, "\n"),
          author: cdlist.nickname,
          play_count: this.formatPlayCount(cdlist.visitnum),
        },
      };
    } catch (error: any) {
      log.error("获取QQ音乐歌单失败:", error.message);
      throw error;
    }
  }
}

// ==================== 酷狗音乐歌单服务 ====================
class KugouSongListService {
  // 解析歌单ID
  private parseListId(input: string): string {
    // 支持格式:
    // https://www.kugou.com/yy/special/single/123456.html
    const regExp = /\/single\/(\d+)/;
    if (regExp.test(input)) {
      return input.replace(regExp, "$1");
    }
    return input;
  }

  // 格式化播放时间
  private formatPlayTime(time: number): string {
    const m = Math.floor(time / 60).toString().padStart(2, "0");
    const s = Math.floor(time % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // 格式化播放次数
  private formatPlayCount(count: number): string {
    if (count > 10000) {
      return (count / 10000).toFixed(1) + "万";
    }
    return String(count);
  }

  // 获取歌单详情
  async getListDetail(rawId: string, page: number = 1): Promise<SongListResult> {
    // 判断是否是 global_collection_id（长度较长，包含字母和数字）
    if (rawId.length > 20 || /[a-zA-Z]/.test(rawId)) {
      log.info("检测到 global_collection_id:", rawId);
      return this.getListDetailByGlobalCollectionId(rawId);
    }

    const id = this.parseListId(rawId);
    log.info("获取酷狗歌单详情, id:", id);

    try {
      const url = `http://www2.kugou.kugou.com/yueku/v9/special/single/${id}-5-9999.html`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const html = await response.text();

      // 从 HTML 中解析歌单数据
      const listDataMatch = html.match(/global\.data = (\[.+\]);/);
      const listInfoMatch = html.match(/global = {[\s\S]+?name: "(.+)"[\s\S]+?pic: "(.+)"[\s\S]+?};/);

      if (!listDataMatch) {
        throw new Error("解析歌单数据失败");
      }

      let listData: any[];
      try {
        listData = JSON.parse(listDataMatch[1]);
      } catch (e) {
        throw new Error("解析歌单 JSON 失败");
      }

      // 获取歌单信息
      let name = "";
      let pic = "";
      if (listInfoMatch) {
        name = listInfoMatch[1];
        pic = listInfoMatch[2];
      }

      // 解析描述
      let desc = "";
      const descMatch = html.match(/<div class="pc_specail_text pc_singer_tab_content" id="specailIntroduceWrap">([\s\S]*?)<\/div>/);
      if (descMatch) {
        desc = descMatch[1].replace(/<[^>]+>/g, "").trim();
      }

      // 解析歌曲列表
      const list: SongInfo[] = listData.map((item: any) => {
        return {
          id: String(item.hash),
          name: item.songname,
          singer: item.singername || "",
          albumName: item.album_name || "",
          interval: this.formatPlayTime(item.duration || 0),
          source: "kg",
          hash: item.hash,
          img: item.album_img?.replace("{size}", "150") || "",
        };
      });

      return {
        list,
        page: 1,
        limit: 10000,
        total: list.length,
        source: "kg",
        info: {
          name,
          img: pic,
          desc,
          author: "",
          play_count: "",
        },
      };
    } catch (error: any) {
      log.error("获取酷狗歌单失败:", error.message);
      throw error;
    }
  }

  // 通过 global_collection_id 获取歌单详情
  private async getListDetailByGlobalCollectionId(globalCollectionId: string): Promise<SongListResult> {
    log.info("通过 global_collection_id 获取酷狗歌单:", globalCollectionId);

    try {
      // 1. 获取歌单信息
      const clienttime = Date.now();
      const paramsObj = {
        appid: 1058,
        specialid: 0,
        global_specialid: globalCollectionId,
        format: "jsonp",
        srcappid: 2919,
        clientver: 20000,
        clienttime: clienttime,
        mid: clienttime,
        uuid: clienttime,
        dfid: "-",
      };
      const signature = this.signatureParams(paramsObj, "web");
      
      const params = Object.entries(paramsObj).map(([k, v]) => `${k}=${v}`).join("&");
      
      const infoResponse = await fetch(`https://mobiles.kugou.com/api/v5/special/info_v2?${params}&signature=${signature}`, {
        headers: {
          "mid": String(clienttime),
          "Referer": "https://m3ws.kugou.com/share/index.php",
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1",
          "dfid": "-",
          "clienttime": String(clienttime),
        },
      });

      if (!infoResponse.ok) {
        throw new Error(`获取歌单信息失败: ${infoResponse.status}`);
      }

      const result = await infoResponse.json();
      log.info("酷狗歌单信息:", result);

      if (result.status !== 1 || !result.data?.specialname) {
        throw new Error("获取歌单信息失败");
      }

      const info = result.data;

      // 2. 获取歌曲列表 - 使用 count 或 songcount
      const songCount = info.songcount || info.count || 0;
      log.info("酷狗歌单歌曲数量:", songCount);
      const songList = await this.getSongListByGlobalCollectionId(globalCollectionId, songCount);

      // 3. 获取歌曲详细信息
      const list = await this.getMusicInfos(songList);

      return {
        list,
        page: 1,
        limit: 10000,
        total: list.length,
        source: "kg",
        info: {
          name: info.specialname,
          img: info.imgurl?.replace("{size}", "240") || "",
          desc: info.intro || "",
          author: info.nickname || "",
          play_count: this.formatPlayCount(info.playcount || 0),
        },
      };
    } catch (error: any) {
      log.error("通过 global_collection_id 获取酷狗歌单失败:", error.message);
      throw error;
    }
  }

  // 通过 global_collection_id 获取歌曲列表
  private async getSongListByGlobalCollectionId(globalCollectionId: string, songCount: number): Promise<any[]> {
    const list: any[] = [];
    const pageSize = 100;
    const totalPages = Math.ceil(songCount / pageSize);

    for (let page = 1; page <= totalPages; page++) {
      const paramsObj = {
        appid: 1005,
        need_sort: 1,
        module: "CloudMusic",
        clientver: 11589,
        pagesize: pageSize,
        global_collection_id: globalCollectionId,
        userid: 0,
        page: page,
        type: 0,
        area_code: 1,
      };
      const signature = this.signatureParams(paramsObj, "android");
      
      const params = Object.entries(paramsObj).map(([k, v]) => `${k}=${v}`).join("&");

      const response = await fetch(`http://pubsongs.kugou.com/v2/get_other_list_file?${params}&signature=${signature}`, {
        headers: {
          "User-Agent": "Android10-AndroidPhone-11589-201-0-playlist-wifi",
        },
      });

      if (!response.ok) {
        log.error(`获取歌曲列表失败: ${response.status}`);
        continue;
      }

      const data = await response.json();
      log.info(`获取歌曲列表响应 (page ${page}):`, JSON.stringify(data).slice(0, 500));
      
      if (data.data?.info && Array.isArray(data.data.info)) {
        log.info(`获取到 ${data.data.info.length} 首歌曲`);
        list.push(...data.data.info);
      } else {
        log.warn(`未获取到歌曲数据或数据格式不正确:`, data);
      }
    }

    return list;
  }

  // 获取歌曲详细信息 - 直接从列表数据中提取
  private async getMusicInfos(songList: any[]): Promise<SongInfo[]> {
    const list: SongInfo[] = [];

    for (const item of songList) {
      // 从列表数据中提取歌曲信息
      // 酷狗 API 返回的 name 字段格式为 "歌手 - 歌曲名"
      let songName = item.name || item.songname || item.songName || "";
      let singerName = item.singername || item.singerName || "";
      
      // 如果 name 包含 " - "，则解析为 "歌手 - 歌曲名" 格式
      if (songName && songName.includes(" - ")) {
        const parts = songName.split(" - ");
        if (parts.length >= 2) {
          singerName = parts[0].trim();
          songName = parts.slice(1).join(" - ").trim();
        }
      }
      
      // 专辑名可能来自 remark 字段
      const albumName = item.album_name || item.albumName || item.remark || "";
      
      // 处理时长 - 酷狗 API 返回的是文件大小，需要通过比特率计算
      // 这里简化处理，使用默认值
      let duration = item.duration || 0;
      if (duration > 10000) {
        // 如果是毫秒，转换为秒
        duration = Math.floor(duration / 1000);
      }
      
      // 处理专辑图片
      let img = item.album_img || item.img || "{size}";
      if (img && !img.includes("http")) {
        img = "{size}";
      }

      list.push({
        id: String(item.hash),
        name: songName,
        singer: singerName,
        albumName: albumName,
        interval: this.formatPlayTime(duration),
        source: "kg",
        hash: item.hash,
        img: img.replace("{size}", "150"),
      });
    }

    return list;
  }

  // 签名参数 - 参考 util.js 实现
  private signatureParams(paramsObj: Record<string, string | number>, platform: string = "android"): string {
    // 酷狗签名密钥根据平台不同
    const key = platform === "web" 
      ? "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt" 
      : "OIlwieks28dk2k092lksi2UIkp";
    
    // 按字母顺序排序参数
    const sortedKeys = Object.keys(paramsObj).sort();
    const paramsStr = sortedKeys.map(k => `${k}=${paramsObj[k]}`).join("");
    
    const text = key + paramsStr + key;
    
    // 使用 MD5 实现
    return md5(text);
  }
}

// ==================== 酷我音乐歌单服务 ====================
class KuwoSongListService {
  private static readonly LIMIT_SONG = 100;

  // 解析歌单ID
  private parseListId(input: string): { id: string; digest?: string } {
    // 支持格式:
    // http://www.kuwo.cn/playlist_detail/123456
    // https://m.kuwo.cn/h5app/playlist/123456
    // digest-8__123456 (带digest前缀的ID)
    const regExp = /\/playlist(?:_detail)?\/(\d+)/;
    const digestRegExp = /^digest-(\d+)__(\d+)$/;
    
    // 检查是否是digest格式
    if (digestRegExp.test(input)) {
      const match = input.match(digestRegExp);
      if (match) {
        return { id: match[2], digest: match[1] };
      }
    }
    
    if (regExp.test(input)) {
      return { id: input.replace(regExp, "$1") };
    }
    return { id: input };
  }

  // 格式化播放次数
  private formatPlayCount(count: number): string {
    if (count > 100000000) {
      return (count / 100000000).toFixed(1) + "亿";
    }
    if (count > 10000) {
      return (count / 10000).toFixed(1) + "万";
    }
    return String(count);
  }

  // 格式化播放时间
  private formatPlayTime(time: number): string {
    const m = Math.floor(time / 60).toString().padStart(2, "0");
    const s = Math.floor(time % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // 获取歌单详情 - digest-8 类型 (带重试)
  private async getListDetailDigest8(id: string, page: number, tryNum: number = 0): Promise<SongListResult> {
    if (tryNum > 2) {
      throw new Error("try max num");
    }

    const url = `http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=${id}&pn=${page - 1}&rn=${KuwoSongListService.LIMIT_SONG}&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1`;

    log.info("[Kuwo] 请求URL (尝试", tryNum + 1, "):", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": "http://www.kuwo.cn/",
      },
    });

    if (!response.ok) {
      if (tryNum < 2) {
        log.warn("[Kuwo] 请求失败, 状态码:", response.status, ", 重试...");
        await new Promise(r => setTimeout(r, 500));
        return this.getListDetailDigest8(id, page, tryNum + 1);
      }
      throw new Error(`请求失败: ${response.status}`);
    }

    const data = await response.json();

    log.info("[Kuwo] API返回 result:", data.result);

    if (data.result !== "ok") {
      if (tryNum < 2) {
        log.warn("[Kuwo] 获取歌单失败, result:", data.result, ", 重试...");
        await new Promise(r => setTimeout(r, 500));
        return this.getListDetailDigest8(id, page, tryNum + 1);
      }
      log.error("[Kuwo] 获取歌单失败, result:", data.result);
      throw new Error("获取歌单失败");
    }

    // 解析歌曲列表 - 酷我返回的字段是 artist (不是 artists)
    const list: SongInfo[] = (data.musiclist || []).map((item: any) => {
      return {
        id: String(item.id),
        name: item.name,
        singer: item.artist || "",
        albumName: item.album || "",
        albumId: item.albumid,
        interval: this.formatPlayTime(parseInt(item.duration) || 0),
        source: "kw",
        songmid: String(item.id),
        img: item.pic || "",
      };
    });

    return {
      list,
      page,
      limit: data.rn || 100,
      total: data.total || list.length,
      source: "kw",
      info: {
        name: data.title || "",
        img: data.pic || "",
        desc: data.info || "",
        author: data.uname || "",
        play_count: this.formatPlayCount(data.playnum || 0),
      },
    };
  }

  // 获取歌单详情 - digest-5 类型 (需要先获取真实ID)
  private async getListDetailDigest5(id: string, page: number): Promise<SongListResult> {
    // 第一步：获取真实歌单ID
    const infoUrl = `http://qukudata.kuwo.cn/q.k?op=query&cont=ninfo&node=${id}&pn=0&rn=1&fmt=json&src=mbox&level=2`;
    
    const infoResponse = await fetch(infoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!infoResponse.ok) {
      throw new Error(`获取歌单信息失败: ${infoResponse.status}`);
    }

    const infoData = await infoResponse.json();
    
    if (!infoData.child || infoData.child.length === 0) {
      throw new Error("无法获取歌单信息");
    }

    const realId = infoData.child[0].sourceid;
    if (!realId) {
      throw new Error("无法获取歌单真实ID");
    }

    // 第二步：使用真实ID获取歌单详情
    return this.getListDetailDigest8(realId, page);
  }

  // 获取歌单详情
  async getListDetail(rawId: string, page: number = 1): Promise<SongListResult> {
    const { id, digest } = this.parseListId(rawId);
    log.info("获取酷我歌单详情, id:", id, "digest:", digest, "page:", page);

    try {
      // 根据digest类型选择不同的获取方式
      if (digest === "5") {
        return await this.getListDetailDigest5(id, page);
      } else {
        // 默认使用 digest-8 方式
        return await this.getListDetailDigest8(id, page);
      }
    } catch (error: any) {
      log.error("获取酷我歌单失败:", error.message);
      throw error;
    }
  }
}

// ==================== 咪咕音乐歌单服务 ====================
class MiguSongListService {
  private static readonly SUCCESS_CODE = "000000";

  // 解析歌单ID
  private parseListId(input: string): string {
    // 支持格式:
    // https://music.migu.cn/v3/music/playlist/123456
    // https://h5.nf.migu.cn/app/v4/p/share/playlist/index.html?id=123456
    const regExp1 = /\/playlist\/(\d+)/;
    const regExp2 = /[?&]id=(\d+)/;
    
    if (regExp1.test(input)) {
      return input.replace(regExp1, "$1");
    }
    if (regExp2.test(input)) {
      return input.replace(regExp2, "$1");
    }
    return input;
  }

  // 格式化播放次数
  private formatPlayCount(count: number): string {
    if (count > 10000) {
      return (count / 10000).toFixed(1) + "万";
    }
    return String(count);
  }

  // 格式化播放时间
  private formatPlayTime(time: number): string {
    const m = Math.floor(time / 60).toString().padStart(2, "0");
    const s = Math.floor(time % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // 获取歌单详情
  async getListDetail(rawId: string, page: number = 1): Promise<SongListResult> {
    const id = this.parseListId(rawId);
    log.info("获取咪咕歌单详情, id:", id, "page:", page);

    try {
      // 并行获取歌曲列表和歌单信息
      const [listData, infoData] = await Promise.all([
        this.getListDetailList(id, page),
        this.getListDetailInfo(id),
      ]);

      return {
        ...listData,
        info: infoData,
      };
    } catch (error: any) {
      log.error("获取咪咕歌单失败:", error.message);
      throw error;
    }
  }

  // 获取歌曲列表
  private async getListDetailList(id: string, page: number): Promise<any> {
    const url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/user/queryMusicListSongs.do?musicListId=${id}&pageNo=${page}&pageSize=50`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
        "Referer": "https://m.music.migu.cn/",
      },
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== MiguSongListService.SUCCESS_CODE) {
      throw new Error("获取歌曲列表失败");
    }

    // 解析歌曲列表
    const list: SongInfo[] = (data.list || []).map((item: any) => {
      // 歌手信息：优先使用 artists 数组，否则使用 singer 字段
      const singerNames = item.artists?.map((s: any) => s.name).join("、") || item.singer || "";
      
      // 处理时长：length 可能是字符串 "00:03:56" 或数字
      let interval = "00:00";
      if (item.length) {
        if (typeof item.length === "string" && item.length.includes(":")) {
          // 已经是格式化的字符串
          interval = item.length;
        } else {
          // 数字格式，需要转换
          interval = this.formatPlayTime(parseInt(item.length) || 0);
        }
      }
      
      return {
        id: String(item.copyrightId || item.songId),
        name: item.songName || item.title,
        singer: singerNames,
        albumName: item.album || "",
        albumId: item.albumId,
        interval: interval,
        source: "mg",
        copyrightId: String(item.copyrightId),
        songId: String(item.songId || item.id),
        img: item.albumImgs?.length ? item.albumImgs[0].img : (item.albumImg?.replace("{size}", "150") || ""),
        lrcUrl: item.lrcUrl,
        mrcUrl: item.mrcUrl,
        trcUrl: item.trcUrl,
      };
    });

    return {
      list,
      page,
      limit: 50,
      total: data.totalCount || list.length,
      source: "mg",
    };
  }

  // 获取歌单信息
  private async getListDetailInfo(id: string): Promise<SongListInfo> {
    const url = `https://c.musicapp.migu.cn/MIGUM3.0/resource/playlist/v2.0?playlistId=${id}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
        "Referer": "https://m.music.migu.cn/",
      },
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== MiguSongListService.SUCCESS_CODE) {
      throw new Error("获取歌单信息失败");
    }

    const playlist = data.data || {};

    return {
      name: playlist.title || "",
      img: playlist.imgItem?.img || "",
      desc: playlist.summary || "",
      author: playlist.ownerName || "",
      play_count: this.formatPlayCount(playlist.opNumItem?.playNum || 0),
    };
  }
}

// ==================== 歌单服务主类 ====================
export class SongListService {
  private neteaseService: NeteaseSongListService;
  private qqService: QQMusicSongListService;
  private kugouService: KugouSongListService;
  private kuwoService: KuwoSongListService;
  private miguService: MiguSongListService;

  constructor() {
    this.neteaseService = new NeteaseSongListService();
    this.qqService = new QQMusicSongListService();
    this.kugouService = new KugouSongListService();
    this.kuwoService = new KuwoSongListService();
    this.miguService = new MiguSongListService();
  }

  // 获取歌单详情
  async getListDetail(source: string, id: string): Promise<SongListResult> {
    log.info("获取歌单详情, source:", source, "id:", id);

    switch (source) {
      case "wy":
        return this.neteaseService.getListDetail(id);
      case "tx":
        return this.qqService.getListDetail(id);
      case "kg":
        return this.kugouService.getListDetail(id);
      case "kw":
        return this.kuwoService.getListDetail(id);
      case "mg":
        return this.miguService.getListDetail(id);
      default:
        throw new Error(`不支持的歌单来源: ${source}`);
    }
  }
}
