# 迁移到 TRSS-Yunzai + Napcat 指南

把当前的网页版 CS:GO 开箱模拟器迁移到 QQ 机器人插件形态运行。

---

## 一、当前项目总结

### 功能

| 模块 | 说明 |
|---|---|
| 商城 | 9 类共 475 个盒子（武器箱 / 纪念包 / 印花胶囊 / 签名胶囊 / 布章 / 胸章 / 涂鸦 / 音乐盒 / 高光纪念包），按类别 tab 切换 |
| 开箱动画 | 横向滚动条 30 物品、第 26 位中奖、cubic-bezier 6 秒缓动、letterbox 上下黑边、黄色指针线、金色稀有特殊全屏旋转光晕 |
| 中奖弹层 | 武器名 + 品质色下划线、大图（金色全屏光晕）、左下磨损/图案模板/已开 N 箱 + 各档统计 tag |
| 库存 | 网格展示已获得物品，按品质/StatTrak 筛选，点击详情可出售 |
| 记录 | 时间倒序列表 + 总开箱次数/品质分布柱状图/最稀有掉落 |
| 设置 | 5 档独立可调概率（万分比）+ 5 个快捷预设（官方真实 / 非洲酋长 / 欧皇 / 均匀 / 残酷）+ 归一化 |
| 音效 | 真实 CS:GO 音效（开箱滚动嘀嘀声 + 6 档品质中奖音 + hover/btnhover），全部本地；HTMLAudio + 首次手势解锁，兼容 iOS Safari / 微信内浏览器 |

### 技术栈

- 纯前端：HTML + CSS + 原生 JS（无任何框架/库）
- localStorage 持久化金币 / 库存 / 历史 / 设置
- **资源完全本地化、零网络依赖**：
  - `assets/data/crates.{json,js}` —— ByMykel 盒子元数据，`crates.js` 是 `window.__CSGO_CRATES__ = [...]` 包装版供 `<script>` 离线加载
  - `assets/skins/{crates,items}/{hash}.png` —— ~11000 张箱图 + 物品图（~600 MB）；文件名是图片 URL 的 64-bit FNV-1a hash（16 hex + `.png`），避开 Steam CDN URL 200+ 字符 basename 触发 Windows MAX_PATH=260 超长无法读取
  - `assets/audio` `assets/bg` `assets/img` —— 11 个音频 / 10 张 CS 地图背景 / 4 张占位图
- 首次下载由 `tools/download_skins.mjs` 一次性完成（仅此步需代理），之后双击 `index.html` 即可完全离线运行

### 文件结构

```
csgo/
├── index.html              # 入口；按顺序加载 assets/data/crates.js → js/*
├── css/
│   ├── base.css            # CSS 变量 + 响应式断点（clamp 驱动）
│   ├── layout.css          # 顶栏 / 视图容器 / 底栏
│   ├── shop.css            # 商城 + 类别 tab
│   ├── case.css            # 开箱页（letterbox + 滚动 + reveal）
│   ├── inventory.css       # 库存
│   ├── history.css         # 记录
│   └── settings.css        # 概率设置
├── js/
│   ├── app.js              # hash 路由 + 全局初始化
│   ├── data.js             # 三级加载（本地 JS → localStorage → 远程兜底） + processCrates + hashUrl + rewriteToLocal
│   ├── rarity.js           # 7 档品质 + 几何概率分配 + 磨损 / StatTrak / 图案模板 / SVG 兜底
│   ├── store.js            # localStorage 抽象（金币 / 库存 / 历史 / 统计）
│   ├── audio.js            # HTMLAudio + iOS 手势解锁（首次 click/touchstart 同步对每个 audio muted play→pause）
│   └── views/
│       ├── shop.js
│       ├── case.js         # 开箱核心（动画 + 滚动 + reveal）
│       ├── inventory.js
│       ├── history.js
│       └── settings.js
├── tools/
│   └── download_skins.mjs  # 一次性下载脚本（Node 18+ 内置 fetch，10 并发，旧文件名自动 rename）
└── assets/
    ├── data/
    │   ├── crates.json     # 原始 ByMykel JSON 存档（约 7 MB）
    │   └── crates.js       # window.__CSGO_CRATES__ = [...] 包装版，<script> 离线加载
    ├── skins/
    │   ├── crates/         # ~475 张箱图 (PNG)
    │   └── items/          # ~10500 张物品图 (PNG)
    ├── audio/              # 11 个音频（m4a / mp3）
    ├── bg/                 # 10 张 CS 地图背景图
    └── img/                # 4 张占位图（buff item_bg / gold / gold1 / gold2）
```

### 数据流

```
启动加载（按优先级）：
  ① 本地 assets/data/crates.js → window.__CSGO_CRATES__         （完全离线，默认路径）
  ② localStorage csgo_crates_v3 (24h TTL)                       （二次启动加速）
  ③ fetch ByMykel/CSGO-API 远程 crates.json                     （兜底，需联网/代理）
                ↓
              data.js processCrates()
                · 每个 c.image / s.image → rewriteToLocal(url, kind)
                ·   = 'assets/skins/{crates|items}/' + hashUrl(url) + '.png'
                ↓
              CASES[] 内部数据结构
                ↓
              rarity.rollDrop(caseObj) → 单次开箱结果
                ↓
              store.addItem() / addHistory()  → localStorage
                ↓
              views 渲染（<img src> 直接读本地 PNG，无网络请求）
```

### 关键工具脚本

`tools/download_skins.mjs`（Node 18+）的职责：

1. 拉取 `crates.json`，同时写 `assets/data/crates.json` + `assets/data/crates.js`
2. 用与 `js/data.js` **完全一致**的 `hashUrl()` 收集所有图片 URL → 目标本地路径
3. 已新文件存在 → 跳过；旧 basename 文件存在 → rename；都不存在 → 下载（10 并发，失败重试 3 次）
4. 总耗时约 20–60 分钟（取决于代理速度），后续断网即可使用

---

## 二、目标架构（TRSS-Yunzai + Napcat）

### 框架角色

| 组件 | 作用 |
|---|---|
| **Napcat** | NTQQ 协议适配器，OneBot v11 协议层；提供消息收发、群管能力 |
| **TRSS-Yunzai** | Node.js 机器人框架，加载插件；用 puppeteer 渲染 HTML 模板 → 图片消息 |
| **本插件** | 命令处理 + 数据持久化 + HTML 模板渲染 |

### 核心范式差异

| 维度 | 网页版 | 机器人插件 |
|---|---|---|
| 交互方式 | 鼠标点击 / 路由切换 | 聊天命令（正则匹配 `e.msg`） |
| 视觉呈现 | 实时 DOM + CSS 动画 | puppeteer 截图 → 图片消息 / 视频 |
| 数据存储 | localStorage（单浏览器） | 文件 / Redis（按 QQ 号隔离多用户） |
| 用户隔离 | 无（单人） | 必须按 `e.user_id` 区分 |
| 音效 | HTMLAudio + 手势解锁 | ❌ QQ 不支持页面音频，需放弃或改为语音消息 |
| 路由 | hash | 命令分发 |
| 图片资源 | 已全量本地化（~600 MB） | **直接拷贝过来**复用，puppeteer 用 file:// 加载本地 PNG |

---

## 三、迁移策略

### 哪些代码可以直接复用

| 模块 | 复用度 | 说明 |
|---|---|---|
| `js/data.js` | ★★★★☆ | 三级加载逻辑改为只读本地 JSON（去掉 localStorage / 远程兜底）；`rewriteToLocal` / `hashUrl` 保留，浏览器和 puppeteer 同样需要本地路径 |
| `js/rarity.js` | ★★★★★ | 纯逻辑，全部复用：`rollDrop` / `rollRarityNumForCase` / `wearTierOf` / `sellPriceOf` 等 |
| `tools/download_skins.mjs` | ★★★★★ | 机器人端首次部署跑一次，把图片落到插件 `resources/img/skins/`（或直接拷贝网页版已下载好的） |
| `assets/data/crates.json` | ★★★★★ | 直接复制到机器人 `resources/data/crates.json` |
| `assets/skins/{crates,items}/*.png` | ★★★★★ | 直接复制到机器人 `resources/img/skins/{crates,items}/`，puppeteer 模板里走 file:// 引用 |
| `assets/bg/*` + `assets/img/*` | ★★★★★ | 完整保留供 HTML 模板使用 |
| `assets/audio/*` | ☆☆☆☆☆ | 抛弃（QQ 不支持） |
| `css/*` + `index.html` 静态部分 | ★★★★☆ | 拆成多个 puppeteer 模板（商城页 / 开箱结果页 / 库存页等），去掉 hash 路由 / 滚动动画相关 |
| `js/store.js` | ★★☆☆☆ | 需要重写：localStorage → 文件 / Redis；按 `user_id` 隔离 |
| `js/views/*.js` | ★★☆☆☆ | 命令处理逻辑保留，DOM 渲染部分抛弃 |
| `js/audio.js` | ☆☆☆☆☆ | 抛弃 |
| `js/app.js`（hash 路由）| ☆☆☆☆☆ | 抛弃 |

### 三种渲染方案选择

| 方案 | 实现 | 优势 | 劣势 |
|---|---|---|---|
| **A. 静态图片**（推荐） | puppeteer 截开箱信息页 + 中奖大图两张 | 简单、消息量小、稳定 | 无动画体验 |
| **B. GIF 动图** | puppeteer 录制 6s 开箱动画导出 GIF | 接近真实开箱感 | 文件大（>2 MB）、生成慢（5-10s），群限速可能发不出 |
| **C. 视频/合并转发** | ffmpeg 转码 + Napcat 发视频 | 完整动画 + 音效 | 实现复杂、对机器人服务器配置要求高 |

**建议先做方案 A**，把图片做精良；后续按用户反馈再加方案 B。

---

## 四、插件目录结构（建议）

```
TRSS-Yunzai/plugins/csgo-opener/
├── index.js                    # 插件入口（导出 apps）
├── apps/
│   ├── shop.js                 # #csgo 武器箱 / #csgo 列表 / #csgo 切换武器箱
│   ├── open.js                 # #csgo 开箱 [箱名] / #csgo 连开10次
│   ├── inventory.js            # #csgo 库存 / #csgo 出售 [uid]
│   ├── history.js              # #csgo 记录 / #csgo 统计
│   └── settings.js             # #csgo 概率 / #csgo 设置概率 [档] [万分比]
├── model/
│   ├── data.js                 # ← 复制网页版 js/data.js，去掉 localStorage / 远程兜底
│   ├── rarity.js               # ← 直接复制网页版 js/rarity.js
│   └── store.js                # ⚠ 重写：用户隔离 + 文件 / Redis 持久化
├── resources/
│   ├── html/                   # puppeteer 模板
│   │   ├── case-info.html      # 商城单箱页面（信息 + 物品列表）
│   │   ├── reveal.html         # 中奖结果页
│   │   ├── inventory.html      # 库存
│   │   └── history.html        # 记录
│   ├── css/                    # ← 从网页版 css/ 复制
│   ├── data/
│   │   └── crates.json         # ← 直接复制 assets/data/crates.json
│   ├── img/
│   │   ├── skins/              # ← 直接复制 assets/skins/{crates,items}/
│   │   ├── bg/                 # ← 直接复制 assets/bg/
│   │   └── img/                # ← 直接复制 assets/img/
├── tools/
│   └── download_skins.mjs      # ← 直接复制（路径常量调整指向 resources/img/skins）
├── config/
│   └── default.yaml            # 全局默认概率、初始金币等
└── data/                       # 运行时数据
    └── users/                  # 每个 QQ 一个 json 文件
        └── 12345678.json
```

---

## 五、命令设计

### 用户命令（聊天框）

| 命令 | 说明 |
|---|---|
| `#csgo` 或 `#csgo 帮助` | 显示所有命令 |
| `#csgo 商城` | 列出所有箱子类别 + 数量 |
| `#csgo 商城 武器箱` | 列出武器箱类别下所有箱子（图片） |
| `#csgo 看 反冲武器箱` | 查看某个箱子的详情（图片：箱子图 + 全部物品） |
| `#csgo 开箱 反冲武器箱` | 开一次，返回中奖大图 |
| `#csgo 连开 反冲武器箱 10` | 连开 10 次，返回合并转发消息（10 张结果图）|
| `#csgo 库存` | 查看自己的库存（图片：网格展示）|
| `#csgo 库存 红色` | 按品质筛选 |
| `#csgo 出售 [uid前6位]` | 出售某件物品 |
| `#csgo 记录` | 查看自己的开箱记录 |
| `#csgo 我的概率` | 显示当前概率设置 |
| `#csgo 概率预设 欧皇` | 切换到预设 |
| `#csgo 设置概率 红 1000` | 把红色调成 1000/100000 |
| `#csgo 重置存档` | 清空个人数据 |

### 管理员命令

| 命令 | 说明 |
|---|---|
| `#csgo 全局概率 默认` | 重置所有用户概率 |
| `#csgo 刷新数据` | 重新跑 `download_skins.mjs` 拉新版 ByMykel crates.json + 增量图片 |

---

## 六、关键代码示例

### 6.1 插件入口 `index.js`

```js
import Shop from './apps/shop.js'
import Open from './apps/open.js'
import Inventory from './apps/inventory.js'
import History from './apps/history.js'
import Settings from './apps/settings.js'

if (!global.segment) {
  global.segment = (await import('oicq')).segment
}

export {
  Shop, Open, Inventory, History, Settings,
}
```

### 6.2 开箱命令 `apps/open.js`

```js
import plugin from '../../../lib/plugins/plugin.js'
import { loadCases, getCase, getCasesByCategory } from '../model/data.js'
import { rollDrop, sellPriceOf, RARITY } from '../model/rarity.js'
import Store from '../model/store.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

await loadCases()  // 启动时预加载（读本地 resources/data/crates.json）

export default class CsgoOpen extends plugin {
  constructor() {
    super({
      name: 'CSGO开箱',
      dsc: 'CS:GO 模拟开箱',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#csgo\\s*开箱\\s*(.+)$',     fnc: 'openOne' },
        { reg: '^#csgo\\s*连开\\s*(.+)\\s+(\\d+)$', fnc: 'openMany' },
      ],
    })
  }

  async openOne(e) {
    const name = e.msg.match(/^#csgo\s*开箱\s*(.+)$/)[1].trim()
    const c = findCaseByName(name)
    if (!c) { e.reply('找不到这个箱子'); return }

    const user = await Store.get(e.user_id)
    if (user.coins < c.price) { e.reply(`金币不足，需要 ${c.price}`); return }

    user.coins -= c.price
    const drop = rollDrop(c)
    user.inventory.unshift(drop)
    user.history.unshift(drop)
    user.stats.opened += 1
    user.stats.byNum[drop.rarityNum] = (user.stats.byNum[drop.rarityNum] || 0) + 1
    if (drop.isStatTrak) {
      user.stats.statTrakByNum[drop.rarityNum] = (user.stats.statTrakByNum[drop.rarityNum] || 0) + 1
    }
    await Store.set(e.user_id, user)

    // drop.image 已是 'assets/skins/items/{hash}.png' 这种相对路径，
    // 模板里拼上插件资源绝对路径前缀即可
    const img = await puppeteer.screenshot('csgo-opener/reveal', {
      drop, caseObj: c, stats: user.stats, coins: user.coins, sellPrice: sellPriceOf(drop),
    })
    e.reply(img)
  }
}
```

### 6.3 数据持久化 `model/store.js` 重写

```js
import fs from 'node:fs/promises'
import path from 'node:path'

const DATA_DIR = path.resolve('./plugins/csgo-opener/data/users')
await fs.mkdir(DATA_DIR, { recursive: true })

const INITIAL = () => ({
  coins: 10000,
  inventory: [],
  history: [],
  stats: { opened: 0, byNum: {1:0,2:0,3:0,4:0,5:0,6:0,7:0}, statTrakByNum: {1:0,2:0,3:0,4:0,5:0,6:0,7:0} },
  odds: null,
})

export default class Store {
  static async get(uid) {
    const fp = path.join(DATA_DIR, `${uid}.json`)
    try {
      return JSON.parse(await fs.readFile(fp, 'utf8'))
    } catch { return INITIAL() }
  }
  static async set(uid, data) {
    const fp = path.join(DATA_DIR, `${uid}.json`)
    await fs.writeFile(fp, JSON.stringify(data), 'utf8')
  }
  static async reset(uid) {
    return this.set(uid, INITIAL())
  }
}
```

> 用户量大时建议改成 Redis：Yunzai 内置 `redis` 客户端，直接 `redis.set('csgo:user:'+uid, JSON.stringify(data))`。

### 6.4 HTML 模板 `resources/html/reveal.html`（puppeteer 渲染）

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/case.css">
  <style>
    body, html { width: 1280px; height: 720px; margin: 0; overflow: hidden; }
    .reveal-card { /* 单页静态版，去掉动画 */ }
  </style>
</head>
<body>
  <div class="cs-bg" style="background-image:url('{{pluResPath}}/img/bg/{{bgFile}}');"></div>
  <div class="lb-mask top"></div>
  <div class="lb-mask bottom"></div>

  <div class="reveal-skinname rar-{{drop.rarityNum}}">
    <span>{{drop.weapon}}{{#if drop.paint}} | {{drop.paint}}{{/if}}{{#if drop.isStatTrak}} <span class="stattrakcolor">(StatTrak™)</span>{{/if}}</span>
    <span class="underline" style="background:{{drop.rarityColor}}"></span>
  </div>

  <div class="reveal-image-wrap">
    <!-- drop.image 是 'assets/skins/items/{hash}.png'，模板里替换前缀指向插件资源目录 -->
    <img src="{{pluResPath}}/img/skins/items/{{drop.imageHash}}.png">
  </div>

  <div class="reveal-info">
    {{#if drop.wear}}磨损: {{drop.wear}}<br>{{/if}}
    {{#if drop.pattern}}图案模板: {{drop.pattern}}<br>{{/if}}
    已开 {{stats.opened}} 箱<br>
    {{tags}}
  </div>
</body>
</html>
```

### 6.5 puppeteer 调用（Yunzai 已内置）

```js
const img = await puppeteer.screenshot('csgo-opener/reveal', {
  tplFile: './plugins/csgo-opener/resources/html/reveal.html',
  pluResPath: process.cwd() + '/plugins/csgo-opener/resources',  // 绝对路径
  drop, caseObj, stats, bgFile: 'dust2_0.jpg',
})
e.reply(img)
```

---

## 七、迁移步骤（建议顺序）

1. **复制资源** — 把网页版 `assets/data/` + `assets/skins/` + `assets/bg/` + `assets/img/` 整体拷贝到插件 `resources/`，避免在机器人端重新下载几百 MB
2. **建插件骨架** — 在 `TRSS-Yunzai/plugins/` 下建 `csgo-opener` 目录，按"四"的结构铺好空文件
3. **搬运纯逻辑** — `js/data.js` + `js/rarity.js` 复制到 `model/`，简化 `data.js` 加载逻辑（直接 `fs.readFile('resources/data/crates.json')`），保留 `hashUrl` / `rewriteToLocal`
4. **写 Store** — 按"6.3"实现文件持久化的 Store，先用 JSON，后期可升 Redis
5. **写第一个命令 `#csgo 开箱`** — 不带模板渲染，先直接文字回复"恭喜获得 AK-47 | 火神 (磨损 0.12, StatTrak)"，跑通流程
6. **加 HTML 模板渲染** — 把网页版 `css/case.css` 复制到 `resources/css/`，写 `reveal.html` 单页模板，puppeteer 截图代替文字
7. **加其它命令** — 商城、库存、记录、设置依次实现
8. **优化** — 合并转发支持连开、按 group_id 做开箱排行榜、定时跑 `download_skins.mjs` 刷新增量数据

---

## 八、注意事项 / 坑

| 项 | 说明 |
|---|---|
| **图片资源路径** | puppeteer 加载 file:// 资源时必须绝对路径，模板里用 `{{pluResPath}}/img/skins/...` 之类的占位由插件运行时注入 |
| **响应式 → 固定尺寸** | puppeteer viewport 固定 1280×720 即可，模板里不再需要 clamp/vw，全部用 px |
| **图片文件名是 hash 而非语义名** | `assets/skins/items/406c273ff3e6d28e.png` 这种命名是为了避开 Windows MAX_PATH=260（Steam CDN URL basename 高达 200+ 字符）；机器人端复用时这套规则要保持不变，模板的 `<img src>` 用 `drop.image`（已是相对路径）即可 |
| **CS map 背景图（每张 500 KB）** | 模板加载 file:// 本地图，不要走 http，避免延迟 |
| **多用户并发** | Store 用文件方案要小心并发写丢失；高并发场景用 Redis 或加锁 |
| **金色全屏旋转光晕动画** | puppeteer 静态截图无法呈现，可以用 GIF 录制：`page.screenshot()` 改成定时连续截图后 `gifencoder` 拼合 |
| **音效完全无法迁移** | QQ 不支持页面音频；可选发"开箱嘀嘀.silk"语音消息（QQ 群可发自录的短语音），但用户体验有限 |
| **存档兼容** | 网页版的 localStorage 数据无法直接迁移到机器人；如需保留可写一个导出 JSON / 机器人导入命令 |
| **更新 ByMykel 数据** | 直接跑 `tools/download_skins.mjs` 增量下载新出的箱子和物品图，已下载文件自动跳过；不需要清理旧文件 |

---

## 九、扩展建议（机器人专属功能）

- **群内开箱排行榜**：`#csgo 群榜` 显示本群按"最稀有掉落 / 总开箱次数"排序
- **每日签到送金币**：`#csgo 签到` 每天领 200 金币
- **PVP 交易**：`#csgo 出价 @对方 [我的物品] 换 [对方物品]`
- **箱子掉率分析**：`#csgo 模拟开箱 反冲武器箱 1000` 后台跑 1000 次返回品质分布柱状图
- **抽奖红包**：群主发起 `#csgo 红包 100箱` 让群员抢着开
- **稀有掉落广播**：群里有人开出红色/金色时自动 at 全员炫耀

---

## 十、依赖清单

- TRSS-Yunzai（latest）
- Napcat / Lagrange / NapCatQQ 任选
- Node.js ≥ 18（用 BigInt + 内置 fetch）
- puppeteer（Yunzai 内置）

---

> 网页版工程位于 `D:\360MoveData\Users\13648\Desktop\csgo`，迁移时直接以本目录为参考源；其中 `assets/data/` + `assets/skins/` + `assets/bg/` + `assets/img/` 可整体复制到机器人插件 `resources/` 下，无需在机器人端重新下载。
