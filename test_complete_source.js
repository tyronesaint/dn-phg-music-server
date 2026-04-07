/*!
 * @name 测试完整音源
 * @description 用于测试拼好歌API的完整功能（搜索、播放、歌词、封面）
 * @version v1.0.0
 * @author Test
 */

const { EVENT_NAMES, request, on, send, utils, env, version } = globalThis.lx

// 模拟歌曲数据库
const mockSongs = [
  {
    name: '演员',
    singer: '薛之谦',
    source: 'kw',
    songmid: 'kw_001',
    albumId: 'album_001',
    albumName: '绅士',
    imgUrl: 'https://picsum.photos/300/300?random=1'
  },
  {
    name: '稻香',
    singer: '周杰伦',
    source: 'kw',
    songmid: 'kw_002',
    albumId: 'album_002',
    albumName: '魔杰座',
    imgUrl: 'https://picsum.photos/300/300?random=2'
  },
  {
    name: '孤勇者',
    singer: '陈奕迅',
    source: 'kw',
    songmid: 'kw_003',
    albumId: 'album_003',
    albumName: '孤勇者',
    imgUrl: 'https://picsum.photos/300/300?random=3'
  },
  {
    name: '晴天',
    singer: '周杰伦',
    source: 'kg',
    songmid: 'kg_001',
    albumId: 'album_004',
    albumName: '叶惠美',
    imgUrl: 'https://picsum.photos/300/300?random=4'
  },
  {
    name: '青花瓷',
    singer: '周杰伦',
    source: 'tx',
    songmid: 'tx_001',
    albumId: 'album_005',
    albumName: '我很忙',
    imgUrl: 'https://picsum.photos/300/300?random=5'
  }
]

// 模拟歌词
const mockLyrics = {
  'kw_001': `[00:00.00] 演员 - 薛之谦
[00:02.00] 词：薛之谦
[00:04.00] 曲：薛之谦
[00:06.00] 简单点说话的方式简单点
[00:10.00] 递进的情绪请省略
[00:14.00] 你又不是个演员
[00:18.00] 别设计那些情节`,
  'kw_002': `[00:00.00] 稻香 - 周杰伦
[00:02.00] 词：周杰伦
[00:04.00] 曲：周杰伦
[00:06.00] 对这个世界如果你有太多的抱怨
[00:10.00] 跌倒了就不敢继续往前走
[00:14.00] 为什么人要这么的脆弱 堕落`,
  'kw_003': `[00:00.00] 孤勇者 - 陈奕迅
[00:02.00] 词：唐恬
[00:04.00] 曲：钱雷
[00:06.00] 都是勇敢的
[00:10.00] 你额头的伤口 你的 不同 你犯的错
[00:14.00] 都不必隐藏 你破旧的玩偶`,
  'kg_001': `[00:00.00] 晴天 - 周杰伦
[00:02.00] 词：周杰伦
[00:04.00] 曲：周杰伦
[00:06.00] 故事的小黄花
[00:10.00] 从出生那年就飘着
[00:14.00] 童年的荡秋千
[00:18.00] 随记忆一直晃到现在`,
  'tx_001': `[00:00.00] 青花瓷 - 周杰伦
[00:02.00] 词：方文山
[00:04.00] 曲：周杰伦
[00:06.00] 素胚勾勒出青花笔锋浓转淡
[00:10.00] 瓶身描绘的牡丹一如你初妆
[00:14.00] 冉冉檀香透过窗心事我了然`
}

// 支持的来源
const musicSources = {
  kw: {
    name: 'kw',
    type: 'music',
    actions: ['musicUrl', 'lyric', 'pic'],
    qualitys: ['128k', '320k', 'flac']
  },
  kg: {
    name: 'kg',
    type: 'music',
    actions: ['musicUrl', 'lyric', 'pic'],
    qualitys: ['128k', '320k']
  },
  tx: {
    name: 'tx',
    type: 'music',
    actions: ['musicUrl', 'lyric', 'pic'],
    qualitys: ['128k', '320k']
  }
}

// 搜索功能
const handleSearch = async (keyword, page = 1, limit = 20) => {
  console.log(`[TestSource] 搜索: ${keyword}, 页码: ${page}, 限制: ${limit}`)
  
  // 模拟搜索延迟
  await new Promise(resolve => setTimeout(resolve, 100))
  
  // 过滤歌曲
  const results = mockSongs.filter(song => 
    song.name.includes(keyword) || song.singer.includes(keyword)
  )
  
  // 分页
  const start = (page - 1) * limit
  const end = start + limit
  const pageResults = results.slice(start, end)
  
  return {
    list: pageResults,
    total: results.length,
    page: page,
    limit: limit
  }
}

// 获取播放地址
const handleGetMusicUrl = async (source, musicInfo, quality) => {
  console.log(`[TestSource] 获取播放地址: ${source}, 质量: ${quality}`)
  
  // 模拟播放地址
  return `https://example.com/music/${musicInfo.songmid}.mp3?quality=${quality}`
}

// 获取歌词
const handleGetLyric = async (musicInfo) => {
  console.log(`[TestSource] 获取歌词: ${musicInfo.songmid}`)
  
  const lyric = mockLyrics[musicInfo.songmid] || '暂无歌词'
  return lyric
}

// 获取封面
const handleGetPic = async (musicInfo) => {
  console.log(`[TestSource] 获取封面: ${musicInfo.songmid}`)
  
  const song = mockSongs.find(s => s.songmid === musicInfo.songmid)
  return song ? song.imgUrl : 'https://picsum.photos/300/300?random=100'
}

// 监听请求
on(EVENT_NAMES.request, ({ action, source, info }) => {
  console.log(`[TestSource] 收到请求: action=${action}, source=${source}`)
  
  switch (action) {
    case 'musicUrl':
      return handleGetMusicUrl(source, info.musicInfo, info.type)
    case 'lyric':
      return handleGetLyric(info.musicInfo)
    case 'pic':
      return handleGetPic(info.musicInfo)
    default:
      console.error(`[TestSource] 不支持的操作: ${action}`)
      return Promise.reject(`action not support: ${action}`)
  }
})

// 声明支持的来源
send(EVENT_NAMES.inited, { 
  status: true,
  sources: musicSources
})

console.log('[TestSource] 完整测试音源已初始化')
