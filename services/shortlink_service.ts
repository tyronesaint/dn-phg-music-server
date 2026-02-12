// 短链接解析服务 - 参考 lx-music-desktop 实现
// 支持平台: 网易云(wy), QQ音乐(tx), 酷狗(kg), 酷我(kw), 咪咕(mg)

// 日志工具
const log = {
  debug: (...args: any[]) => console.log("[ShortLink]", ...args),
  info: (...args: any[]) => console.log("[ShortLink]", ...args),
  warn: (...args: any[]) => console.warn("[ShortLink]", ...args),
  error: (...args: any[]) => console.error("[ShortLink]", ...args),
};

// 解析结果接口
export interface ParseResult {
  source: string;  // wy, tx, kg, kw, mg
  id: string;      // 歌单ID
}

// ==================== 短链接解析服务 ====================
export class ShortLinkService {
  // 平台域名映射
  private static readonly DOMAIN_MAP: Record<string, string> = {
    "music.163.com": "wy",
    "y.qq.com": "tx",
    "i.y.qq.com": "tx",
    "kugou.com": "kg",
    "kugou.kugou.com": "kg",
    "m.kugou.com": "kg",
    "www2.kugou.kugou.com": "kg",
    "kuwo.cn": "kw",
    "www.kuwo.cn": "kw",
    "m.kuwo.cn": "kw",
    "music.migu.cn": "mg",
    "m.music.migu.cn": "mg",
    "app.c.nf.migu.cn": "mg",
  };

  // 各平台的正则表达式
  private static readonly REGEXPS = {
    // 网易云
    wy: {
      listDetailLink: /^.+(?:\?|&)id=(\d+)(?:&.*$|#.*$|$)/,
      listDetailLink2: /^.+\/playlist\/(\d+)\/\d+\/.+$/,
    },
    // QQ音乐
    tx: {
      listDetailLink: /\/playlist\/(\d+)/,
      listDetailLink2: /[?&]id=(\d+)/,
    },
    // 酷狗
    kg: {
      listDetailLink: /^.+\/(\d+)\.html(?:\?.*|&.*$|#.*$|$)/,
      chainLink: /chain=(\w+)/,
      globalCollectionId: /global_collection_id=(\w+)/,
    },
    // 酷我
    kw: {
      listDetailLink: /[?&]pid=(\d+)/,
      listDetailLink2: /\/playlist_detail\/(\d+)/,
    },
    // 咪咕
    mg: {
      listDetailLink: /[?&]id=(\d+)/,
      listDetailLink2: /\/playlist\/(\d+)/,
    },
  };

  /**
   * 解析短链接获取歌单信息
   * @param link 用户输入的链接
   * @returns ParseResult 包含 source 和 id
   */
  async parseShortLink(link: string): Promise<ParseResult> {
    log.info("开始解析短链接:", link);

    // 1. 先尝试从链接中识别平台和提取ID
    const result = this.extractFromUrl(link);
    if (result) {
      log.info("从URL直接提取成功:", result);
      return result;
    }

    // 2. 如果无法直接提取，发送HTTP请求获取重定向
    log.info("无法直接提取，尝试获取重定向...");
    return this.resolveRedirect(link);
  }

  /**
   * 从URL中直接提取平台和ID
   */
  private extractFromUrl(url: string): ParseResult | null {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, "");
      
      // 获取平台标识
      const source = ShortLinkService.DOMAIN_MAP[domain] || ShortLinkService.DOMAIN_MAP[urlObj.hostname];
      if (!source) {
        log.warn("未知的域名:", urlObj.hostname);
        return null;
      }

      // 根据平台提取ID
      const id = this.extractIdBySource(url, source);
      if (id) {
        return { source, id };
      }

      return null;
    } catch (error) {
      log.error("URL解析失败:", error);
      return null;
    }
  }

  /**
   * 根据平台提取ID
   */
  private extractIdBySource(url: string, source: string): string | null {
    const regexps = ShortLinkService.REGEXPS[source as keyof typeof ShortLinkService.REGEXPS];
    if (!regexps) return null;

    for (const key of Object.keys(regexps)) {
      const regExp = (regexps as any)[key];
      if (regExp.test(url)) {
        const match = url.match(regExp);
        if (match && match[1]) {
          return match[1];
        }
      }
    }

    return null;
  }

  /**
   * 公共方法：从URL中提取指定平台的歌单ID
   * @param url 歌单链接或酷狗码
   * @param source 平台标识 (wy, tx, kg, kw, mg)
   * @returns 歌单ID 或 null
   */
  async extractIdFromUrl(url: string, source: string): Promise<string | null> {
    log.info(`从URL提取ID, source: ${source}, url: ${url}`);
    
    // 酷狗特殊处理：支持酷狗码（纯数字）
    if (source === "kg" && /^\d+$/.test(url)) {
      log.info("检测到酷狗码:", url);
      // 通过酷狗码获取歌单ID
      const listId = await this.getKugouListIdByCode(url);
      if (listId) {
        log.info("酷狗码解析成功, 歌单ID:", listId);
        return listId;
      }
    }
    
    // 首先尝试直接从URL提取
    const id = this.extractIdBySource(url, source);
    if (id) {
      log.info("直接从URL提取ID成功:", id);
      return id;
    }
    
    // 如果直接提取失败，尝试获取重定向后的URL
    log.info("直接提取失败，尝试获取重定向...");
    try {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15",
        },
      });
      
      // 如果HEAD请求失败，尝试GET请求
      if (response.status >= 500) {
        const getResponse = await fetch(url, {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15",
          },
        });
        
        const location = getResponse.headers.get("location");
        if (location) {
          log.info("获取到重定向地址:", location);
          const redirectId = this.extractIdBySource(location, source);
          if (redirectId) {
            return redirectId;
          }
        }
      } else {
        const location = response.headers.get("location");
        if (location) {
          log.info("获取到重定向地址:", location);
          const redirectId = this.extractIdBySource(location, source);
          if (redirectId) {
            return redirectId;
          }
        }
      }
    } catch (error: any) {
      log.error("获取重定向失败:", error.message);
    }
    
    return null;
  }

  /**
   * 通过酷狗码获取歌单ID
   * @param code 酷狗码（纯数字）
   * @returns 歌单ID 或 null
   */
  private async getKugouListIdByCode(code: string): Promise<string | null> {
    try {
      log.info("通过酷狗码获取歌单ID:", code);
      
      // 使用 JSON 格式发送请求体（参考 lx-music-desktop）
      const response = await fetch("http://t.kugou.com/command/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "KG-RC": "1",
          "KG-THash": "network_super_call.cpp:3676261689:379",
          "User-Agent": "",
        },
        body: JSON.stringify({
          appid: 1001,
          clientver: 9020,
          mid: "21511157a05844bd085308bc76ef3343",
          clienttime: 640612895,
          key: "36164c4015e704673c588ee202b9ecb8",
          data: code,
        }),
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const data = await response.json();
      log.info("酷狗码解析结果:", data);

      // 酷狗API返回的数据结构: data.data.info
      if (data.status !== 1 || !data.data?.info) {
        log.error("酷狗码解析失败:", data);
        return null;
      }

      const info = data.data.info;
      
      // type 1单曲，2歌单，3电台，4酷狗码，5别人的播放队列
      // 对于 type 4（酷狗码），使用 global_collection_id 获取歌单
      if (info.type === 2 || info.type === 4) {
        // 歌单类型或酷狗码类型
        if (info.global_collection_id) {
          return info.global_collection_id;
        }
        if (info.id) {
          return String(info.id);
        }
      }

      log.error("不支持的酷狗码类型:", info.type);
      return null;
    } catch (error: any) {
      log.error("通过酷狗码获取歌单ID失败:", error.message);
      return null;
    }
  }

  /**
   * 解析重定向链接
   */
  private async resolveRedirect(link: string, retryNum: number = 0): Promise<ParseResult> {
    if (retryNum > 2) {
      throw new Error("短链接解析重试次数超过限制");
    }

    try {
      log.info(`发送HTTP请求获取重定向 (尝试 ${retryNum + 1}/3)...`);
      
      // 首先尝试 HEAD 请求
      let response = await fetch(link, {
        method: "HEAD",
        redirect: "manual",  // 手动处理重定向
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
      });

      // 如果 HEAD 请求失败 (500错误等)，尝试 GET 请求
      if (response.status >= 500) {
        log.warn(`HEAD请求返回 ${response.status}，尝试GET请求...`);
        response = await fetch(link, {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
          },
        });
      }

      // 获取重定向地址
      const location = response.headers.get("location");
      
      if (location && location !== link) {
        log.info("获取到重定向地址:", location);
        
        // 尝试从新地址提取
        const result = this.extractFromUrl(location);
        if (result) {
          log.info("从重定向地址提取成功:", result);
          return result;
        }
        
        // 继续追踪重定向链
        return this.resolveRedirect(location, retryNum + 1);
      }

      // 没有重定向，尝试从响应体中提取（某些平台）
      log.info("没有重定向，尝试获取页面内容...");
      return this.extractFromPage(link);

    } catch (error: any) {
      log.error("解析重定向失败:", error.message);
      if (retryNum < 2) {
        log.warn("等待后重试...");
        await new Promise(r => setTimeout(r, 500));
        return this.resolveRedirect(link, retryNum + 1);
      }
      throw error;
    }
  }

  /**
   * 从页面内容中提取（备用方案）
   */
  private async extractFromPage(link: string): Promise<ParseResult> {
    try {
      const response = await fetch(link, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const html = await response.text();

      // 检测QQ音乐错误页面
      if (html.includes("此歌单已被创建者设为隐私")) {
        throw new Error("该歌单已被创建者设为隐私，无法访问");
      }
      if (html.includes("歌单不存在") || html.includes("内容已失效")) {
        throw new Error("歌单不存在或链接已失效");
      }

      // 尝试匹配酷狗的全局收藏ID
      const kgGlobalMatch = html.match(/"global_collection_id":"(\w+)"/);
      if (kgGlobalMatch) {
        return { source: "kg", id: kgGlobalMatch[1] };
      }

      // 尝试匹配网易云歌单ID
      const wyMatch = html.match(/playlist\?id=(\d+)/);
      if (wyMatch) {
        return { source: "wy", id: wyMatch[1] };
      }

      // 尝试匹配QQ音乐歌单ID - 多种格式
      const txMatch = html.match(/playlist\/(\d+)/);
      if (txMatch) {
        return { source: "tx", id: txMatch[1] };
      }
      // QQ音乐移动端格式
      const txMobileMatch = html.match(/playsquare\/(\d+)/);
      if (txMobileMatch) {
        return { source: "tx", id: txMobileMatch[1] };
      }

      // 尝试从页面中的JavaScript数据中提取
      const txDataMatch = html.match(/"disstid":\s*"?(\d+)"?/);
      if (txDataMatch) {
        return { source: "tx", id: txDataMatch[1] };
      }

      throw new Error("无法从页面内容中提取歌单信息，可能是链接已失效或歌单不存在");

    } catch (error: any) {
      log.error("从页面提取失败:", error.message);
      throw error;
    }
  }

  /**
   * 检测链接类型并返回提示
   */
  detectLinkType(link: string): { type: string; source?: string } {
    // 检测是否是短链接
    const shortLinkPatterns = [
      /t\.kugou\.com/,           // 酷狗短链
      /url\.cn/,                 // QQ短链
      /163\.fm/,                 // 网易短链
      /dwz\.cn/,                 // 百度短链
      /tinyurl\.com/,            // TinyURL
      /bit\.ly/,                 // Bitly
      /goo\.gl/,                 // Google短链
    ];

    for (const pattern of shortLinkPatterns) {
      if (pattern.test(link)) {
        return { type: "shortlink" };
      }
    }

    // 检测是否是已知平台
    const result = this.extractFromUrl(link);
    if (result) {
      return { type: "direct", source: result.source };
    }

    return { type: "unknown" };
  }
}
