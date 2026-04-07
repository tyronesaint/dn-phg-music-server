import { Application } from "../app.ts";
import { RequestHandler } from "../handler/request_handler.ts";
import { ScriptStorage } from "../storage/storage.ts";
import { ScriptEngine } from "../engine/script_engine.ts";
import { SearchService } from "../services/search_service.ts";
import { LyricService } from "../services/lyric_service.ts";
import { SongListService } from "../services/songlist_service.ts";
import { ShortLinkService } from "../services/shortlink_service.ts";

const REQUEST_TIMEOUT_MS = 15000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
  abortController?: AbortController
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (abortController) {
        abortController.abort();
      }
      reject(new Error(`请求超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T | null;
}

class ApiResponseBuilder {
  static success<T>(data: T, msg: string = "success"): ApiResponse<T> {
    return {
      code: 200,
      msg,
      data,
    };
  }

  static error(msg: string, code: number = 400, data: any = null): ApiResponse<any> {
    return {
      code,
      msg,
      data,
    };
  }

  static created<T>(data: T, msg: string = "created"): ApiResponse<T> {
    return {
      code: 201,
      msg,
      data,
    };
  }

  static notFound(msg: string = "not found"): ApiResponse<null> {
    return {
      code: 404,
      msg,
      data: null,
    };
  }

  static serverError(msg: string = "internal server error"): ApiResponse<null> {
    return {
      code: 500,
      msg,
      data: null,
    };
  }

  static toResponse<T>(data: ApiResponse<T>, httpStatus: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status: httpStatus,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  static toTextResponse(content: string, contentType: string = "text/plain; charset=utf-8"): Response {
    return new Response(content, {
      headers: { "Content-Type": contentType },
    });
  }

  static toHtmlResponse(html: string): Response {
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

export class APIRoutes {
  private app: Application;
  private handler: RequestHandler;
  private storage: ScriptStorage;
  private engine: ScriptEngine;
  private searchService: SearchService;
  private lyricService: LyricService;
  private songListService: SongListService;
  private shortLinkService: ShortLinkService;
  private apiKey: string;

  constructor(
    app: Application,
    handler: RequestHandler,
    storage: ScriptStorage,
    engine: ScriptEngine,
    apiKey: string
  ) {
    this.app = app;
    this.handler = handler;
    this.storage = storage;
    this.engine = engine;
    this.apiKey = apiKey;
    this.searchService = new SearchService();
    this.lyricService = new LyricService();
    this.songListService = new SongListService();
    this.shortLinkService = new ShortLinkService();

    this.setupRoutes();
  }

  private setupRoutes(): void {
    const router = this.app.getRouter();
    const prefix = `/${this.apiKey}`;

    router.get("/", () => this.handleIndex());
    router.get("/api/status", (ctx) => this.handleStatus(ctx));

    // 管理页面
    router.get(`${prefix}/admin`, () => this.handleAdminPage());
    // 测试页面
    router.get(`${prefix}/test`, () => this.handleTestPage());

    router.get(`${prefix}/test/search`, (ctx) => this.handleScriptTestSearch(ctx));

    router.post(`${prefix}/api/scripts`, (ctx) => this.handleImportScript(ctx));
    router.get(`${prefix}/api/scripts/loaded`, (ctx) => this.handleGetLoadedScripts(ctx));
    router.post(`${prefix}/api/scripts/delete`, (ctx) => this.handleRemoveScript(ctx));

    router.post(`${prefix}/api/scripts/import/url`, (ctx) => this.handleImportScriptFromUrl(ctx));
    router.post(`${prefix}/api/scripts/import/file`, (ctx) => this.handleImportScriptFromFile(ctx));

    router.post(`${prefix}/api/scripts/default`, (ctx) => this.handleSetDefaultSource(ctx));
    router.get(`${prefix}/api/scripts/default`, (ctx) => this.handleGetDefaultSource(ctx));

    router.post(`${prefix}/api/cache/music-url/enable`, (ctx) => this.handleSetMusicUrlCacheEnabled(ctx));
    router.get(`${prefix}/api/cache/music-url/status`, (ctx) => this.handleGetMusicUrlCacheStatus(ctx));
    router.post(`${prefix}/api/cache/music-url/clear`, (ctx) => this.handleClearMusicUrlCache(ctx));

    router.post(`${prefix}/api/music/url`, async (ctx) => {
      console.log('\n========== [API] 收到 /api/music/url 请求 ==========');
      const startTime = Date.now();
      let response: Response;
      try {
        response = await this.handleGetMusicUrl(ctx);
        const duration = Date.now() - startTime;
        console.log('[API] /api/music/url 调用完成，耗时:', duration, 'ms');
        console.log('[API] 返回状态:', response.status);
        const headersObj: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headersObj[key] = value;
        });
        console.log('[API] 返回头:', headersObj);
        const responseBody = await response.clone().text();
        console.log('[API] 返回内容:', responseBody);
        console.log('========== [API] /api/music/url 请求结束 ==========\n');
        return response;
      } catch (error: any) {
        console.error('[API] /api/music/url 抛出异常:', error.message);
        console.error('[API] 异常堆栈:', error.stack);
        console.log('========== [API] /api/music/url 请求异常结束 ==========\n');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message || "Internal Server Error"), 500);
      }
    });
    router.post(`${prefix}/api/music/lyric`, async (ctx) => {
      console.log('\n========== [API] 收到 /api/music/lyric 请求 ==========');
      const startTime = Date.now();
      try {
        const response = await this.handleGetLyric(ctx);
        const duration = Date.now() - startTime;
        console.log('[API] /api/music/lyric 调用完成，耗时:', duration, 'ms');
        console.log('[API] 返回状态:', response.status);
        const responseBody = await response.clone().text();
        console.log('[API] 返回内容:', responseBody);
        console.log('========== [API] /api/music/lyric 请求结束 ==========\n');
        return response;
      } catch (error: any) {
        console.error('[API] /api/music/lyric 抛出异常:', error.message);
        console.error('[API] 异常堆栈:', error.stack);
        console.log('========== [API] /api/music/lyric 请求异常结束 ==========\n');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message || "Internal Server Error"), 500);
      }
    });

    // 搜索接口（使用内置搜索服务）
    router.get(`${prefix}/api/search`, (ctx) => this.handleSearch(ctx));

    // 歌单接口（使用内置歌单服务）
    router.post(`${prefix}/api/songlist/detail`, (ctx) => this.handleSongListDetail(ctx));
    router.post(`${prefix}/api/songlist/detail/by-link`, (ctx) => this.handleSongListDetailByLink(ctx));

    // 封面接口（使用内置歌词服务）
    router.get(`${prefix}/api/music/pic`, (ctx) => this.handleGetPic(ctx));

    router.post(`${prefix}/api/request`, (ctx) => this.handleRequest(ctx));
    router.delete(`${prefix}/api/request/:requestKey`, (ctx) => this.handleCancelRequest(ctx));
  }


  private async handleGetLyric(ctx: any): Promise<Response> {
    console.log('\n========== [API] handleGetLyric 开始 ==========');

    try {
      const body = await ctx.req.json();
      console.log('[API] 请求参数:', JSON.stringify(body, null, 2));

      if (!body.songId) {
        console.error('[API] 缺少 songId 参数');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数: songId", 400));
      }

      const source = body.source || 'unknown';
      const name = body.name || '未知歌曲';
      const singer = body.singer || '未知歌手';

      const musicInfo = {
        songmid: body.songId,
        hash: body.songId,
        id: body.songId,
        name,
        singer,
        source,
      };

      console.log('[API] 调用音源脚本获取歌词...');
      const response = await this.engine.getLyric({
        source,
        action: 'lyric',
        info: {
          musicInfo,
        },
      });

      if (!response || !response.data) {
        console.error('[API] 脚本返回无效响应');
        console.log('========== [API] handleGetLyric 结束 ==========\n');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("音源脚本返回无效响应", 500));
      }

      const lyricData = response.data as any;

      console.log('[API] 返回成功响应');
      console.log('========== [API] handleGetLyric 结束 ==========\n');
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        lyric: lyricData.lyric || '',
        tlyric: lyricData.tlyric || '',
        rlyric: lyricData.rlyric || '',
        lxlyric: lyricData.lxlyric || '',
      }, "获取歌词成功"));
    } catch (error: any) {
      console.error('[API] 获取歌词失败:', error.message);
      console.error('[API] 错误堆栈:', error.stack);
      console.log('========== [API] handleGetLyric 结束 ==========\n');
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message));
    }
  }

  // 使用内置搜索服务进行搜索
  private async handleSearch(ctx: any): Promise<Response> {
    console.log('\n========== [API] handleSearch 开始 ==========');

    try {
      // 使用 ctx.query 获取查询参数
      const params = ctx.query || {};
      console.log('[API] 请求参数:', JSON.stringify(params, null, 2));

      const keyword = params.keyword;
      const source = params.source || 'wy';
      const page = parseInt(params.page || '1', 10);
      const count = parseInt(params.count || '30', 10);

      if (!keyword) {
        console.error('[API] 缺少keyword参数');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数: keyword", 400));
      }

      console.log('[API] 开始搜索, source:', source, 'keyword:', keyword, 'page:', page, 'count:', count);

      // 调用搜索服务
      const results = await this.searchService.search(keyword, source, page, count);

      console.log('[API] 搜索成功, 结果类型:', typeof results);
      console.log('[API] 搜索成功, 是否为数组:', Array.isArray(results));
      console.log('[API] 搜索成功, 结果数量:', results?.length);

      // 检查 results 是否有效
      if (!results || !Array.isArray(results)) {
        console.error('[API] 搜索结果无效:', results);
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("搜索结果无效", 500));
      }

      // 将结果转换为统一的响应格式
      const flattenedResults = results.flatMap(r => {
        return Array.isArray(r.results) ? r.results : [];
      });

      const response = ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        list: flattenedResults,
        page,
        limit: count,
        total: flattenedResults.length,
        source,
        platforms: results.map(r => ({
          platform: r.platform,
          name: r.name,
          count: Array.isArray(r.results) ? r.results.length : 0,
          error: r.error
        }))
      }, "搜索成功"));

      console.log('========== [API] handleSearch 结束 ==========\n');
      return response;
    } catch (error: any) {
      console.error('[API] 搜索失败:', error.message);
      console.error('[API] 错误堆栈:', error.stack);
      console.log('========== [API] handleSearch 异常结束 ==========\n');
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message || "搜索失败"));
    }
  }

  // 使用内置歌词服务获取封面
  private async handleGetPic(ctx: any): Promise<Response> {
    console.log('\n========== [API] handleGetPic 开始 ==========');

    try {
      // 使用 ctx.query 获取查询参数
      const params = ctx.query || {};
      console.log('[API] 请求参数:', JSON.stringify(params, null, 2));

      const source = params.source;
      const songId = params.songId || params.songmid;

      if (!source || !songId) {
        console.error('[API] 缺少必要参数');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数: source 和 songId", 400));
      }

      console.log('[API] 开始获取封面, source:', source, 'songId:', songId);

      // 调用歌词服务获取封面
      const picUrl = await this.lyricService.getPic(source, songId);

      if (!picUrl) {
        console.error('[API] 获取封面失败');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.notFound("未找到封面"));
      }

      console.log('[API] 获取封面成功:', picUrl);

      // 返回封面URL
      const response = ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        pic: picUrl,
      }, "获取封面成功"));

      console.log('========== [API] handleGetPic 结束 ==========\n');
      return response;
    } catch (error: any) {
      console.error('[API] 获取封面失败:', error.message);
      console.error('[API] 错误堆栈:', error.stack);
      console.log('========== [API] handleGetPic 异常结束 ==========\n');
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message || "获取封面失败"));
    }
  }

  // 使用内置歌单服务获取歌单详情
  private async handleSongListDetail(ctx: any): Promise<Response> {
    console.log('\n========== [API] handleSongListDetail 开始 ==========');

    try {
      const body = await ctx.req.json();
      console.log('[API] 请求参数:', JSON.stringify(body, null, 2));

      if (!body.source) {
        console.error('[API] 缺少source参数');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数: source", 400));
      }

      if (!body.id) {
        console.error('[API] 缺少id参数');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数: id (歌单ID或链接)", 400));
      }

      const source = body.source;
      const id = body.id;

      const validSources = ['wy', 'tx', 'kg', 'kw', 'mg'];
      if (!validSources.includes(source)) {
        console.error('[API] 不支持的音源:', source);
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(`不支持的音源: ${source}，支持: wy, tx, kg, kw, mg`, 400));
      }

      console.log('[API] 开始获取歌单详情, source:', source, 'id:', id);

      // 调用歌单服务
      const result = await this.songListService.getListDetail(source, id);

      console.log('[API] 歌单详情获取成功');
      console.log('[API] 歌单名称:', result.info.name);
      console.log('[API] 歌曲数量:', result.list.length);
      console.log('[API] 总数量:', result.total);

      const response = ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        list: result.list,
        page: result.page,
        limit: result.limit,
        total: result.total,
        source: result.source,
        info: result.info,
      }, "获取歌单详情成功"));

      console.log('========== [API] handleSongListDetail 结束 ==========\n');
      return response;
    } catch (error: any) {
      console.error('[API] 获取歌单详情失败:', error.message);
      console.error('[API] 错误堆栈:', error.stack);
      console.log('========== [API] handleSongListDetail 异常结束 ==========\n');
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message || "获取歌单详情失败"));
    }
  }

  // 使用内置歌单服务通过链接获取歌单详情
  private async handleSongListDetailByLink(ctx: any): Promise<Response> {
    console.log('\n========== [API] handleSongListDetailByLink 开始 ==========');

    try {
      const body = await ctx.req.json();
      console.log('[API] 请求参数:', JSON.stringify(body, null, 2));

      if (!body.link) {
        console.error('[API] 缺少link参数');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数: link (歌单链接)", 400));
      }

      const link = body.link;
      const specifiedSource = body.source;

      let source: string;
      let id: string;

      if (specifiedSource) {
        console.log('[API] 客户端指定了平台:', specifiedSource);
        source = specifiedSource;

        // 从链接中提取ID
        const extractedId = await this.shortLinkService.extractIdFromUrl(link, source);
        if (!extractedId) {
          console.error('[API] 无法从链接中提取ID');
          return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("无法从链接中提取歌单ID，请检查链接格式是否正确", 400));
        }
        id = extractedId;
        console.log('[API] 从链接提取ID成功:', id);
      } else {
        // 自动识别平台和ID
        console.log('[API] 开始解析短链接:', link);
        const parseResult = await this.shortLinkService.parseShortLink(link);
        console.log('[API] 短链接解析成功:', parseResult);
        source = parseResult.source;
        id = parseResult.id;
      }

      // 调用歌单服务获取详情
      console.log('[API] 开始获取歌单详情, source:', source, 'id:', id);
      const result = await this.songListService.getListDetail(source, id);

      console.log('[API] 歌单详情获取成功');
      console.log('[API] 歌单名称:', result.info.name);
      console.log('[API] 歌曲数量:', result.list.length);
      console.log('[API] 总数量:', result.total);

      const response = ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        list: result.list,
        page: result.page,
        limit: result.limit,
        total: result.total,
        source: result.source,
        info: result.info,
        parsed: {
          source: source,
          id: id,
        },
      }, "获取歌单详情成功"));

      console.log('========== [API] handleSongListDetailByLink 结束 ==========\n');
      return response;
    } catch (error: any) {
      console.error('[API] 获取歌单详情失败:', error.message);
      console.error('[API] 错误堆栈:', error.stack);
      console.log('========== [API] handleSongListDetailByLink 异常结束 ==========\n');
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message || "获取歌单详情失败"));
    }
  }

  private async handleIndex(): Promise<Response> {
    try {
      const readmePath = new URL("../README.md", import.meta.url).pathname;
      const readmeContent = await Deno.readTextFile(readmePath);
      
      const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>拼好歌 后端服务框架</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .card {
      background: white; border-radius: 10px; padding: 30px; margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin-bottom: 20px; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
    h2 { color: #667eea; margin: 25px 0 15px 0; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    h3 { color: #555; margin: 20px 0 10px 0; }
    h4 { color: #666; margin: 15px 0 10px 0; }
    p { color: #444; line-height: 1.8; margin: 10px 0; }
    code { 
      background: #f4f4f4; padding: 2px 6px; border-radius: 3px; 
      font-family: 'Monaco', 'Menlo', monospace; font-size: 0.9em;
    }
    pre { 
      background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 5px; 
      overflow-x: auto; margin: 15px 0;
    }
    pre code { background: none; color: inherit; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background: #f8f8f8; }
    tr:nth-child(even) { background: #fafafa; }
    blockquote { 
      border-left: 4px solid #667eea; padding-left: 15px; margin: 15px 0; 
      color: #666; background: #f9f9f9; padding: 10px 15px;
    }
    ul, ol { margin: 10px 0; padding-left: 25px; }
    li { margin: 5px 0; line-height: 1.6; }
    hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }
    a { color: #667eea; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 15px 0; }
    strong { color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      ${this.markdownToHtml(readmeContent)}
    </div>
  </div>
</body>
</html>
      `;
      
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (error) {
      return new Response("README.md not found", { status: 404 });
    }
  }

  private async handleAdminPage(): Promise<Response> {
    const scripts = this.storage.getLoadedScripts();
    const defaultSource = this.storage.getDefaultSourceInfo();
    const scriptsJson = JSON.stringify(scripts);
    const defaultSourceJson = JSON.stringify(defaultSource);
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>音源管理 - 拼好歌</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .card {
      background: white; border-radius: 10px; padding: 25px; margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .nav-bar { display: flex; gap: 10px; margin-bottom: 20px; }
    .nav-btn {
      padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 14px; font-weight: 500; transition: all 0.2s;
      background: rgba(255,255,255,0.3); color: white;
    }
    .nav-btn:hover { background: rgba(255,255,255,0.4); }
    .nav-btn.active { background: white; color: #667eea; }
    h1 { color: #333; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
    h1 span { font-size: 24px; }
    h2 { color: #667eea; margin: 0 0 15px 0; font-size: 18px; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; color: #555; font-weight: 500; }
    input[type="text"], textarea {
      width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px;
      font-size: 14px; transition: border-color 0.2s;
    }
    input[type="text"]:focus, textarea:focus { outline: none; border-color: #667eea; }
    .btn {
      padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 14px; font-weight: 500; transition: all 0.2s; margin-right: 10px;
    }
    .btn-primary { background: #667eea; color: white; }
    .btn-primary:hover { background: #5a6fd6; }
    .btn-danger { background: #dc3545; color: white; }
    .btn-danger:hover { background: #c82333; }
    .btn-success { background: #28a745; color: white; }
    .btn-success:hover { background: #218838; }
    .btn-secondary { background: #6c757d; color: white; }
    .btn-secondary:hover { background: #5a6268; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .script-list { list-style: none; }
    .script-item {
      border: 1px solid #eee; border-radius: 8px; padding: 15px; margin-bottom: 10px;
      display: flex; justify-content: space-between; align-items: center;
      transition: all 0.2s;
    }
    .script-item:hover { border-color: #667eea; box-shadow: 0 2px 8px rgba(102,126,234,0.1); }
    .script-item.default { border-color: #28a745; background: #f8fff8; }
    .script-info h3 { font-size: 16px; color: #333; margin-bottom: 5px; }
    .script-info p { font-size: 13px; color: #666; margin: 2px 0; }
    .script-info .tag {
      display: inline-block; background: #e9ecef; color: #495057;
      padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-right: 5px;
    }
    .script-info .tag.default-tag { background: #28a745; color: white; }
    .script-actions { display: flex; gap: 8px; }
    .empty-state { text-align: center; padding: 40px; color: #666; }
    .empty-state span { font-size: 48px; display: block; margin-bottom: 10px; }
    .toast {
      position: fixed; bottom: 20px; right: 20px; padding: 15px 25px;
      border-radius: 8px; color: white; font-weight: 500;
      transform: translateY(100px); opacity: 0; transition: all 0.3s; z-index: 1000;
    }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.success { background: #28a745; }
    .toast.error { background: #dc3545; }
    .loading { display: none; text-align: center; padding: 20px; }
    .loading.show { display: block; }
    .spinner {
      border: 3px solid #f3f3f3; border-top: 3px solid #667eea;
      border-radius: 50%; width: 30px; height: 30px;
      animation: spin 1s linear infinite; margin: 0 auto 10px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .quick-import { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .quick-import .btn { flex: 1; min-width: 120px; text-align: center; }
    .status-bar { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
    .status-item {
      background: #f8f9fa; padding: 12px 20px; border-radius: 8px;
      text-align: center; flex: 1; min-width: 100px;
    }
    .status-item .value { font-size: 24px; font-weight: bold; color: #667eea; }
    .status-item .label { font-size: 12px; color: #666; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav-bar">
      <button class="nav-btn" onclick="location.href='/'">首页</button>
      <button class="nav-btn active">音源管理</button>
      <button class="nav-btn" onclick="location.href=API_PREFIX+'/test'">音源测试</button>
    </div>
    <div class="card">
      <h1><span>🎵</span> 音源管理</h1>
      <div class="status-bar">
        <div class="status-item">
          <div class="value" id="scriptCount">0</div>
          <div class="label">已加载音源</div>
        </div>
        <div class="status-item">
          <div class="value" id="defaultSource">未设置</div>
          <div class="label">默认音源</div>
        </div>
      </div>
      <h2>📥 导入音源</h2>
      <div class="form-group">
        <label>从 URL 导入</label>
        <div style="display: flex; gap: 10px;">
          <input type="text" id="importUrl" placeholder="输入音源脚本 URL..." style="flex: 1;">
          <button class="btn btn-primary" onclick="importFromUrl()">导入</button>
        </div>
      </div>
      <div class="quick-import">
        <button class="btn btn-secondary" onclick="quickImport('https://raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js')">六音音源</button>
        <button class="btn btn-secondary" onclick="quickImport('https://raw.githubusercontent.com/lyswhut/lx-music-source/master/scripts/dist/lx-music-source.js')">官方示例</button>
      </div>
      <div class="form-group" style="margin-top: 20px;">
        <label>从文件导入</label>
        <input type="file" id="importFile" accept=".js" onchange="importFromFile()">
      </div>
    </div>
    <div class="card">
      <h2>📋 已加载音源</h2>
      <div class="loading" id="loading">
        <div class="spinner"></div>
        <div>处理中...</div>
      </div>
      <ul class="script-list" id="scriptList"></ul>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    const API_PREFIX = '/${this.apiKey}';
    const SCRIPTS_DATA = ${scriptsJson};
    const DEFAULT_SOURCE = ${defaultSourceJson};
    
    function init() {
      document.getElementById('scriptCount').textContent = SCRIPTS_DATA.length;
      document.getElementById('defaultSource').textContent = DEFAULT_SOURCE ? DEFAULT_SOURCE.name : '未设置';
      renderScriptList();
    }
    
    function renderScriptList() {
      const list = document.getElementById('scriptList');
      if (SCRIPTS_DATA.length === 0) {
        list.innerHTML = '<li class="empty-state"><span>📭</span><p>暂无音源，请导入</p></li>';
        return;
      }
      list.innerHTML = SCRIPTS_DATA.map(function(script) {
        var tags = '<span class="tag">v' + (script.version || '未知') + '</span>';
        tags += '<span class="tag">' + (script.author || '未知作者') + '</span>';
        script.supportedSources.forEach(function(s) { tags += '<span class="tag">' + s + '</span>'; });
        var defaultTag = script.isDefault ? '<span class="tag default-tag">默认</span>' : '';
        var setDefaultBtn = !script.isDefault ? '<button class="btn btn-success btn-sm" onclick="setDefault(\\'' + script.id + '\\')">设为默认</button>' : '';
        var actions = setDefaultBtn + '<button class="btn btn-danger btn-sm" onclick="deleteScript(\\'' + script.id + '\\')">删除</button>';
        return '<li class="script-item' + (script.isDefault ? ' default' : '') + '" id="script-' + script.id + '">' +
          '<div class="script-info"><h3>' + script.name + ' ' + defaultTag + '</h3>' +
          '<p>' + (script.description || '无描述') + '</p><p>' + tags + '</p>' +
          '<p style="font-size: 11px; color: #999;">ID: ' + script.id + '</p></div>' +
          '<div class="script-actions">' + actions + '</div></li>';
      }).join('');
    }
    
    function showToast(message, type) {
      type = type || 'success';
      var toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type;
      toast.classList.add('show');
      setTimeout(function() { toast.classList.remove('show'); }, 3000);
    }
    
    function showLoading() { document.getElementById('loading').classList.add('show'); }
    function hideLoading() { document.getElementById('loading').classList.remove('show'); }
    
    function importFromUrl() {
      var url = document.getElementById('importUrl').value.trim();
      if (!url) { showToast('请输入 URL', 'error'); return; }
      showLoading();
      fetch(API_PREFIX + '/api/scripts/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      }).then(function(res) { return res.json(); }).then(function(data) {
        if (data.code === 200 || data.code === 201) { showToast('导入成功'); setTimeout(function() { location.reload(); }, 1000); }
        else { showToast(data.msg || '导入失败', 'error'); }
      }).catch(function(e) { showToast('导入失败: ' + e.message, 'error'); }).finally(hideLoading);
    }
    
    function quickImport(url) {
      document.getElementById('importUrl').value = url;
      importFromUrl();
    }
    
    function importFromFile() {
      var file = document.getElementById('importFile').files[0];
      if (!file) return;
      showLoading();
      file.text().then(function(content) {
        return fetch(API_PREFIX + '/api/scripts/import/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: content, fileName: file.name })
        });
      }).then(function(res) { return res.json(); }).then(function(data) {
        if (data.code === 200 || data.code === 201) { showToast('导入成功'); setTimeout(function() { location.reload(); }, 1000); }
        else { showToast(data.msg || '导入失败', 'error'); }
      }).catch(function(e) { showToast('导入失败: ' + e.message, 'error'); }).finally(hideLoading);
    }
    
    function deleteScript(id) {
      if (!confirm('确定要删除这个音源吗？')) return;
      showLoading();
      fetch(API_PREFIX + '/api/scripts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      }).then(function(res) { return res.json(); }).then(function(data) {
        if (data.code === 200) { showToast('删除成功'); setTimeout(function() { location.reload(); }, 1000); }
        else { showToast(data.msg || '删除失败', 'error'); }
      }).catch(function(e) { showToast('删除失败: ' + e.message, 'error'); }).finally(hideLoading);
    }
    
    function setDefault(id) {
      showLoading();
      fetch(API_PREFIX + '/api/scripts/default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      }).then(function(res) { return res.json(); }).then(function(data) {
        if (data.code === 200) { showToast('设置成功'); setTimeout(function() { location.reload(); }, 1000); }
        else { showToast(data.msg || '设置失败', 'error'); }
      }).catch(function(e) { showToast('设置失败: ' + e.message, 'error'); }).finally(hideLoading);
    }
    
    init();
  </script>
</body>
</html>`;
    
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  private async handleTestPage(): Promise<Response> {
    const scripts = this.storage.getLoadedScripts();
    const defaultSource = this.storage.getDefaultSourceInfo();
    const scriptsJson = JSON.stringify(scripts);
    
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>音源测试 - 拼好歌</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    .card {
      background: white; border-radius: 10px; padding: 25px; margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
    h1 span { font-size: 24px; }
    h2 { color: #667eea; margin: 0 0 15px 0; font-size: 18px; }
    .nav-bar { display: flex; gap: 10px; margin-bottom: 20px; }
    .nav-btn {
      padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 14px; font-weight: 500; transition: all 0.2s;
      background: rgba(255,255,255,0.3); color: white;
    }
    .nav-btn:hover { background: rgba(255,255,255,0.4); }
    .nav-btn.active { background: white; color: #667eea; }
    
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; color: #555; font-weight: 500; }
    select, input[type="text"], input[type="number"] {
      width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px;
      font-size: 14px; transition: border-color 0.2s;
    }
    select:focus, input:focus { outline: none; border-color: #667eea; }
    
    .btn {
      padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 14px; font-weight: 500; transition: all 0.2s;
    }
    .btn-primary { background: #667eea; color: white; }
    .btn-primary:hover { background: #5a6fd6; }
    .btn-secondary { background: #6c757d; color: white; }
    .btn-secondary:hover { background: #5a6268; }
    
    .result-area {
      background: #2d2d2d; border-radius: 8px; padding: 15px; margin-top: 20px;
      max-height: 500px; overflow-y: auto;
    }
    .result-area pre { margin: 0; color: #f8f8f2; font-size: 12px; white-space: pre-wrap; word-wrap: break-word; }
    
    .loading { display: none; text-align: center; padding: 20px; }
    .loading.show { display: block; }
    .spinner {
      border: 3px solid #f3f3f3; border-top: 3px solid #667eea;
      border-radius: 50%; width: 30px; height: 30px;
      animation: spin 1s linear infinite; margin: 0 auto 10px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    
    .test-type-tabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .tab-btn {
      padding: 8px 16px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;
      background: white; font-size: 13px; transition: all 0.2s;
    }
    .tab-btn:hover { border-color: #667eea; }
    .tab-btn.active { background: #667eea; color: white; border-color: #667eea; }
    
    .input-group { display: none; }
    .input-group.show { display: block; }
    
    .quick-tests { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
    .quick-tests .btn { font-size: 12px; padding: 8px 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav-bar">
      <button class="nav-btn" onclick="location.href='/'">首页</button>
      <button class="nav-btn" onclick="location.href=API_PREFIX+'/admin'">音源管理</button>
      <button class="nav-btn active">音源测试</button>
    </div>
    
    <div class="card">
      <h1><span>🧪</span> 音源测试</h1>
      <p style="color: #666; margin-bottom: 20px;">测试音源是否可用，快速排查问题</p>
      
      <div class="form-group">
        <label>选择音源</label>
        <select id="sourceSelect">
          <option value="">默认音源</option>
        </select>
      </div>
      
      <div class="test-type-tabs">
        <button class="tab-btn active" data-type="search">搜索歌曲</button>
        <button class="tab-btn" data-type="url">获取播放地址</button>
        <button class="tab-btn" data-type="lyric">获取歌词</button>
        <button class="tab-btn" data-type="pic">获取封面</button>
      </div>
      
      <div id="searchInputs" class="input-group show">
        <div class="form-group">
          <label>关键词</label>
          <input type="text" id="searchKeyword" placeholder="歌曲名或歌手名" value="演员">
        </div>
        <div class="quick-tests">
          <button class="btn btn-secondary" onclick="quickSearch('演员')">演员</button>
          <button class="btn btn-secondary" onclick="quickSearch('稻香')">稻香</button>
          <button class="btn btn-secondary" onclick="quickSearch('孤勇者')">孤勇者</button>
        </div>
      </div>
      
      <div id="urlInputs" class="input-group">
        <div class="form-group">
          <label>来源 <span style="color:red">*</span></label>
          <select id="urlSource">
            <option value="kw">酷我音乐 (kw)</option>
            <option value="kg">酷狗音乐 (kg)</option>
            <option value="tx">QQ音乐 (tx)</option>
            <option value="wy">网易云音乐 (wy)</option>
            <option value="mg">咪咕音乐 (mg)</option>
          </select>
        </div>
        <div class="form-group">
          <label>音质 <span style="color:red">*</span></label>
          <select id="urlQuality">
            <option value="128">128k (低)</option>
            <option value="192">192k (中)</option>
            <option value="320" selected>320k (高)</option>
            <option value="999">无损 (flac)</option>
          </select>
        </div>
        <div class="form-group">
          <label>歌曲 ID <span style="color:red">*</span></label>
          <input type="text" id="urlSongId" placeholder="从搜索结果中复制歌曲ID" value="">
        </div>
      </div>
      
      <div id="lyricInputs" class="input-group">
        <div class="form-group">
          <label>来源（可选）</label>
          <select id="lyricSource">
            <option value="">自动检测</option>
            <option value="kw">酷我音乐 (kw)</option>
            <option value="kg">酷狗音乐 (kg)</option>
            <option value="tx">QQ音乐 (tx)</option>
            <option value="wy">网易云音乐 (wy)</option>
            <option value="mg">咪咕音乐 (mg)</option>
          </select>
        </div>
        <div class="form-group">
          <label>歌曲 ID <span style="color:red">*</span></label>
          <input type="text" id="lyricSongId" placeholder="从搜索结果中复制歌曲ID" value="">
        </div>
      </div>
      
      <div id="picInputs" class="input-group">
        <div class="form-group">
          <label>来源（可选）</label>
          <select id="picSource">
            <option value="">自动检测</option>
            <option value="kw">酷我音乐 (kw)</option>
            <option value="kg">酷狗音乐 (kg)</option>
            <option value="tx">QQ音乐 (tx)</option>
            <option value="wy">网易云音乐 (wy)</option>
            <option value="mg">咪咕音乐 (mg)</option>
          </select>
        </div>
        <div class="form-group">
          <label>歌曲 ID <span style="color:red">*</span></label>
          <input type="text" id="picSongId" placeholder="从搜索结果中复制歌曲ID" value="">
        </div>
      </div>
      
      <div style="margin-top: 20px;">
        <button class="btn btn-primary" onclick="runTest()">开始测试</button>
        <button class="btn btn-secondary" onclick="clearResult()">清除结果</button>
      </div>
      
      <div class="loading" id="loading">
        <div class="spinner"></div>
        <div>测试中...</div>
      </div>
      
      <div class="result-area" id="resultArea" style="display: none;">
        <pre id="resultContent"></pre>
      </div>
    </div>
  </div>
  
  <script>
    const API_PREFIX = '/${this.apiKey}';
    const SCRIPTS_DATA = ${scriptsJson};
    let currentTestType = 'search';
    
    function init() {
      const select = document.getElementById('sourceSelect');
      select.innerHTML = '<option value="">默认音源</option>';
      SCRIPTS_DATA.forEach(function(script) {
        var option = document.createElement('option');
        option.value = script.id;
        option.textContent = script.name + (script.isDefault ? ' (默认)' : '');
        select.appendChild(option);
      });
      
      setupTabs();
    }
    
    function setupTabs() {
      var tabs = document.querySelectorAll('.tab-btn');
      var groups = document.querySelectorAll('.input-group');
      
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          tabs.forEach(function(t) { t.classList.remove('active'); });
          this.classList.add('active');
          
          groups.forEach(function(g) { g.classList.remove('show'); });
          var targetId = this.getAttribute('data-type') + 'Inputs';
          document.getElementById(targetId).classList.add('show');
          
          currentTestType = this.getAttribute('data-type');
        });
      });
    }
    
    function quickSearch(keyword) {
      document.getElementById('searchKeyword').value = keyword;
      document.querySelectorAll('.tab-btn')[0].click();
      runTest();
    }
    
    function showLoading() {
      document.getElementById('loading').classList.add('show');
      document.getElementById('resultArea').style.display = 'none';
    }
    
    function hideLoading() {
      document.getElementById('loading').classList.remove('show');
    }
    
    function showResult(data) {
      var resultArea = document.getElementById('resultArea');
      var resultContent = document.getElementById('resultContent');
      resultContent.textContent = JSON.stringify(data, null, 2);
      resultArea.style.display = 'block';
    }
    
    function clearResult() {
      document.getElementById('resultArea').style.display = 'none';
      document.getElementById('resultContent').textContent = '';
    }
    
    async function runTest() {
      var sourceId = document.getElementById('sourceSelect').value;
      var url = API_PREFIX;
      var body = {};
      
      if (currentTestType === 'search') {
        var keyword = document.getElementById('searchKeyword').value.trim();
        if (!keyword) { alert('请输入关键词'); return; }
        if (!sourceId) { alert('请选择脚本'); return; }
        
        // 使用新的脚本搜索接口
        url += '/test/search?scriptId=' + encodeURIComponent(sourceId) + '&keyword=' + encodeURIComponent(keyword) + '&page=1&limit=10';
      } else if (currentTestType === 'url') {
        var songId = document.getElementById('urlSongId').value.trim();
        var source = document.getElementById('urlSource').value;
        var quality = document.getElementById('urlQuality').value;
        if (!songId) { alert('请输入歌曲ID'); return; }
        if (!source) { alert('请选择来源'); return; }
        if (!quality) { alert('请选择音质'); return; }
        
        url += '/api/music/url';
        body = { source: source, quality: quality, songId: songId };
        if (sourceId) body.sourceId = sourceId;
      } else if (currentTestType === 'lyric') {
        var songId = document.getElementById('lyricSongId').value.trim();
        var source = document.getElementById('lyricSource').value;
        if (!songId) { alert('请输入歌曲ID'); return; }
        
        url += '/api/music/lyric';
        body = { songId: songId };
        if (source) body.source = source;
        if (sourceId) body.sourceId = sourceId;
      } else if (currentTestType === 'pic') {
        var songId = document.getElementById('picSongId').value.trim();
        var source = document.getElementById('picSource').value;
        if (!songId) { alert('请输入歌曲ID'); return; }
        
        url += '/api/music/pic';
        body = { songId: songId };
        if (source) body.source = source;
        if (sourceId) body.sourceId = sourceId;
      }
      
      showLoading();
      try {
        var options = {
          method: currentTestType === 'search' ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json' }
        };
        if (currentTestType !== 'search') {
          options.body = JSON.stringify(body);
        }
        
        var response = await fetch(url, options);
        var data = await response.json();
        
        showResult({
          status: response.status + ' ' + response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data: data
        });
      } catch (e) {
        showResult({ error: e.message });
      } finally {
        hideLoading();
      }
    }
    
    init();
  </script>
</body>
</html>`;
    
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  private markdownToHtml(markdown: string): string {
    let html = markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
      .replace(/^---$/gim, '<hr>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    
    html = html.replace(/<li>/g, '<ul><li>').replace(/<\/li><br><ul><li>/g, '</li><li>');
    html = html.replace(/<\/li><br>(?!<li>)/g, '</li></ul><br>');
    
    return html;
  }

  private async handleScriptTestSearch(ctx: any): Promise<Response> {
    try {
      const url = new URL(ctx.req.url, `http://${ctx.req.headers.get('host')}`);
      const scriptId = url.searchParams.get('scriptId');
      const keyword = url.searchParams.get('keyword');
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '20');

      if (!scriptId) {
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数: scriptId", 400));
      }

      if (!keyword) {
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数: keyword", 400));
      }

      const result = await this.engine.search(scriptId, keyword, page, limit);
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        scriptId,
        keyword,
        page,
        limit,
        result
      }));
    } catch (error: any) {
      console.error('[API] Script test search error:', error);
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleStatus(_ctx: any): Promise<Response> {
    const defaultSource = this.storage.getDefaultSourceInfo();
    return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
      scriptCount: this.storage.getScriptCount(),
      activeRequests: this.handler.getActiveRequestCount(),
      timestamp: Date.now(),
      defaultSource: defaultSource,
    }));
  }

  private async handleGetLoadedScripts(_ctx: any): Promise<Response> {
    try {
      const scripts = this.storage.getLoadedScripts();
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success(scripts));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleImportScript(ctx: any): Promise<Response> {
    try {
      let body;
      const contentType = ctx.req.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        body = await ctx.req.json();
      } else {
        const text = await ctx.req.text();
        body = { script: text };
      }

      if (!body.script) {
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少脚本内容", 400));
      }

      let scriptInfo;
      if (/^https?:\/\//.test(body.script)) {
        scriptInfo = await this.storage.importScriptFromUrl(body.script);
      } else {
        scriptInfo = await this.storage.importScript(body.script);
      }
      
      const loaded = await this.engine.loadScript(scriptInfo);

      return ApiResponseBuilder.toResponse(ApiResponseBuilder.created({
        apiInfo: scriptInfo,
        loaded,
      }, "脚本导入成功"));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleImportScriptFromUrl(ctx: any): Promise<Response> {
    try {
      const body = await ctx.req.json();
      
      if (!body.url) {
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少URL参数", 400));
      }

      const scriptInfo = await this.storage.importScriptFromUrl(body.url);
      const loaded = await this.engine.loadScript(scriptInfo);

      const loadedScripts = this.storage.getLoadedScripts();
      const defaultInfo = this.storage.getDefaultSourceInfo();

      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        success: loaded,
        defaultSource: {
          id: defaultInfo?.id || null,
          name: defaultInfo?.name || null,
          supportedSources: defaultInfo?.supportedSources || [],
        },
        scripts: loadedScripts,
      }, "从URL导入成功"));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleImportScriptFromFile(ctx: any): Promise<Response> {
    try {
      const contentType = ctx.req.headers.get("content-type") || "";
      let body: any = {};

      if (contentType.includes("multipart/form-data")) {
        const text = await ctx.req.text();
        const boundary = contentType.split("boundary=")[1];
        const parts = text.split("--" + boundary);
        
        for (const part of parts) {
          if (part.includes("filename=")) {
            const scriptMatch = part.match(/Content-Type:.*?\r?\n\r?\n([\s\S]*?)\r?\n--/);
            if (scriptMatch) {
              body.script = scriptMatch[1].trim();
            }
          }
        }
      } else {
        body = await ctx.req.json();
      }

      if (!body.script) {
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少脚本内容", 400));
      }

      const scriptInfo = await this.storage.importScriptFromFile(body.script, body.fileName);
      const loaded = await this.engine.loadScript(scriptInfo);

      return ApiResponseBuilder.toResponse(ApiResponseBuilder.created({
        apiInfo: scriptInfo,
        loaded,
      }, "从文件导入成功"));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleRemoveScript(ctx: any): Promise<Response> {
    try {
      const body = await ctx.req.json();
      const { id } = body;
      
      if (!id) {
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少脚本ID参数", 400));
      }
      
      const removed = await this.storage.removeScript(id);

      if (removed) {
        await this.engine.unloadScript(id);
      }

      const loadedScripts = this.storage.getLoadedScripts();
      const defaultInfo = this.storage.getDefaultSourceInfo();

      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        success: removed,
        defaultSource: {
          id: defaultInfo?.id || null,
          name: defaultInfo?.name || null,
          supportedSources: defaultInfo?.supportedSources || [],
        },
        scripts: loadedScripts,
      }, removed ? "脚本已删除" : "脚本不存在"));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleSetDefaultSource(ctx: any): Promise<Response> {
    try {
      const body = await ctx.req.json();
      const { id } = body;
      
      if (!id) {
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少脚本ID参数", 400));
      }
      
      const success = await this.storage.setDefaultSource(id);
      const scriptInfo = await this.storage.getScript(id);
      
      if (success && scriptInfo) {
        await this.engine.unloadScript(id);
        await this.engine.loadScript(scriptInfo);
      }

      const loadedScripts = this.storage.getLoadedScripts();
      const defaultInfo = this.storage.getDefaultSourceInfo();
      
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        success: success,
        defaultSource: {
          id: defaultInfo?.id || null,
          name: defaultInfo?.name || null,
          supportedSources: defaultInfo?.supportedSources || [],
        },
        scripts: loadedScripts,
      }, success ? `默认音源已设置为: ${scriptInfo?.name || id}` : "设置失败"));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleGetDefaultSource(_ctx: any): Promise<Response> {
    try {
      const defaultInfo = this.storage.getDefaultSourceInfo();
      const loadedScripts = this.storage.getLoadedScripts();
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        defaultSource: {
          id: defaultInfo?.id || null,
          name: defaultInfo?.name || null,
          supportedSources: defaultInfo?.supportedSources || [],
        },
        scripts: loadedScripts,
      }));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleSetMusicUrlCacheEnabled(ctx: any): Promise<Response> {
    try {
      const body = await ctx.req.json();
      const enabled = body.enabled === 1 || body.enabled === true;

      await this.storage.setMusicUrlCacheEnabled(enabled);
      const isEnabled = await this.storage.isMusicUrlCacheEnabled();
      const cacheCount = await this.storage.getMusicUrlCacheCount();

      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        enabled: isEnabled,
        cacheCount,
      }, enabled ? "音乐URL缓存已开启" : "音乐URL缓存已关闭"));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleGetMusicUrlCacheStatus(_ctx: any): Promise<Response> {
    try {
      const isEnabled = await this.storage.isMusicUrlCacheEnabled();
      const cacheCount = await this.storage.getMusicUrlCacheCount();

      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        enabled: isEnabled,
        cacheCount,
      }));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleClearMusicUrlCache(_ctx: any): Promise<Response> {
    try {
      await this.storage.clearMusicUrlCache();

      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        cleared: true,
      }, "音乐URL缓存已清除"));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(error.message, 500));
    }
  }

  private async handleGetMusicUrl(ctx: any): Promise<Response> {
    console.log('\n========== [API] handleGetMusicUrl 开始 ==========');

    try {
      const body = await ctx.req.json();
      console.log('[API] 请求参数:', JSON.stringify(body, null, 2));

      const requiredFields = ['source', 'quality'];
      for (const field of requiredFields) {
        if (!body[field]) {
          console.error(`[API] 缺少必要参数: ${field}`);
          return ApiResponseBuilder.toResponse(ApiResponseBuilder.error(`缺少必要参数: ${field}`, 400));
        }
      }

      const songId = body.songmid || body.id || body.songId || body.musicInfo?.id || body.musicInfo?.songmid || body.musicInfo?.hash || '';
      console.log('[API] songId:', songId);

      if (!songId) {
        console.error('[API] 缺少歌曲ID');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数: songId", 400));
      }

      const cacheEnabled = await this.storage.isMusicUrlCacheEnabled();
      const cacheKey = `${body.source}_${songId}_${body.quality}`;

      if (cacheEnabled) {
        const cachedUrl = await this.storage.getMusicUrlCache(body.source, songId, body.quality);
        if (cachedUrl && cachedUrl.url) {
          console.log(`[API] 使用缓存 URL, cacheKey: ${cacheKey}`);
          const responseData = {
            url: cachedUrl.url,
            type: cachedUrl.quality || body.quality,
            source: body.source,
            quality: body.quality,
            lyric: '',
            tlyric: '',
            rlyric: '',
            lxlyric: '',
            cached: true,
            cachedAt: new Date(cachedUrl.cachedAt).toISOString(),
          };
          console.log('[API] 返回缓存数据');
          console.log('========== [API] handleGetMusicUrl 结束 ==========\n');
          return ApiResponseBuilder.toResponse(ApiResponseBuilder.success(responseData, "获取成功（缓存）"));
        }
        console.log(`[API] 缓存未命中, cacheKey: ${cacheKey}`);
      }

      const name = body.name || body.musicInfo?.name || '未知歌曲';
      const singer = body.singer || body.musicInfo?.singer || '未知歌手';

      const defaultScriptId = this.storage.getDefaultSource();
      const scriptId = defaultScriptId || 'unknown';
      const originalSource = body.source;

      const musicInfo = {
        ...body.musicInfo,
        songmid: songId,
        hash: songId,
        id: songId,
        name,
        singer,
      };

      console.log('[API] 调用音源脚本获取播放URL...');
      const response = await this.engine.getMusicUrl({
        source: body.source,
        action: 'musicUrl',
        info: {
          type: body.quality,
          musicInfo,
        },
      });

      if (!response || !response.data || !(response.data as any).url) {
        console.error('[API] 脚本返回无效响应');
        await this.storage.updateSourceStats(scriptId, originalSource, false);
        console.log('========== [API] handleGetMusicUrl 结束 ==========\n');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("音源脚本返回无效响应", 500));
      }

      const musicUrlData = response.data as any;

      if (musicUrlData.url.endsWith('2149972737147268278.mp3')) {
        console.error('[API] 检测到无效URL');
        await this.storage.updateSourceStats(scriptId, originalSource, false);
        console.log('========== [API] handleGetMusicUrl 结束 ==========\n');
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("获取播放URL失败", 500));
      }

      await this.storage.updateSourceStats(scriptId, originalSource, true);

      if (cacheEnabled && songId) {
        await this.storage.setMusicUrlCache(body.source, songId, musicUrlData.url, body.quality);
        console.log(`[API] 已缓存 URL, cacheKey: ${cacheKey}`);
      }

      const responseData = {
        url: musicUrlData.url,
        type: musicUrlData.type || body.quality,
        source: body.source,
        quality: body.quality,
        lyric: '',
        tlyric: '',
        rlyric: '',
        lxlyric: '',
        cached: false,
      };

      console.log('[API] 返回成功响应');
      console.log('========== [API] handleGetMusicUrl 结束 ==========\n');
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success(responseData, "获取成功"));
    } catch (error: any) {
      console.error('[API] 获取播放URL失败:', error.message);
      console.error('[API] 错误堆栈:', error.stack);
      console.log('========== [API] handleGetMusicUrl 结束 ==========\n');
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message));
    }
  }


  // 处理歌单详情请求

  // 处理短链接歌单详情请求



  private async handleRequest(ctx: any): Promise<Response> {
    try {
      const body = await ctx.req.json();

      if (!body.requestKey || !body.data) {
        return ApiResponseBuilder.toResponse(ApiResponseBuilder.error("缺少必要参数", 400));
      }

      const result = await this.handler.handleRequest(body);

      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success(result, "请求完成"));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message));
    }
  }

  private async handleCancelRequest(ctx: any): Promise<Response> {
    try {
      const { requestKey } = ctx.params;
      this.handler.cancelRequest(requestKey);

      return ApiResponseBuilder.toResponse(ApiResponseBuilder.success({
        requestKey,
      }, "请求已取消"));
    } catch (error: any) {
      return ApiResponseBuilder.toResponse(ApiResponseBuilder.serverError(error.message));
    }
  }
}
