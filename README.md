# cs-opener-plugin

> **CS 模拟开箱** TRSS-Yunzai 插件 — 商城浏览 / 视频开箱 / 仓库管理 全套体验

[![ByMykel](https://img.shields.io/badge/data-ByMykel%2FCSGO--API-blue)](https://github.com/ByMykel/CSGO-API)

复刻 CS 客户端开箱流程，包括 **6 秒滚动条 + 黄色指针 + 上下黑边 letterbox + 真实音效 + 金色全屏旋转光晕 + 品质色发光 reveal + 右上角玩家昵称水印 + 底部作者署名**。
开箱以 MP4 视频形式发到群里（约 14s），其余页面用 puppeteer 截图。
预览页物品太多时会**自动滚动展示**完整列表（2s 内匀速滚完），滚完才开箱。

# 部分使用效果
![效果图1](./example/1.gif)
![效果图2](./example/2.png)

---

## 命令一览

> 所有命令的 **`#` 可省略**、`cs` 与命令之间的**空格也可省略**。
> 例：`#cs 开箱`、`cs 开箱`、`#cs开箱`、`cs开箱` 都触发。
> 其中 `开箱` 和 `选箱` 还可**完全省略 cs 前缀**：直接发 `开箱` 也会触发。

### 玩家命令

**金币循环**：初始 10000 + 每日 `#cs 签到` +500 + `#cs 出售 [uid]` 卖物品。开箱单价见箱子（一般 17）。

| 命令 | 说明 | 输出 |
|---|---|---|
| `#cs` 或 `#cs 帮助` | 命令清单 | 图 |
| `#cs 签到` | **每日领 500 金币**（CST 0 点重置；图含头像/余额/累计开箱/最稀有掉落） | 图 |
| `#cs 商城` | 默认看武器箱 | 图 |
| `#cs 商城 印花胶囊` | 切换类别<br>（武器箱 / 纪念包 / 高光纪念包 / 印花胶囊 / 签名胶囊 / 布章包 / 胸章胶囊 / 涂鸦箱 / 音乐盒集） | 图 |
| `#cs 看 反冲武器箱` | 查看单个箱子详情（含全部物品+概率） | 图 |
| **`#cs 开箱`** | **开你的默认箱**（不带箱名 = 默认；从未设置 = 第一个武器箱） | **MP4 视频，约 14s** |
| `#cs 开箱 反冲武器箱` | 直接开指定箱子，**并记忆为默认** | MP4 |
| `#cs 选箱 反冲武器箱` | 只切换默认箱不开箱（不花钱）| 文字 |
| `#cs 选箱` | 查看当前默认箱 | 文字 |
| `#cs 仓库` | 自己全部库存 | 图 |
| `#cs 仓库 红` | 按品质筛选（白 / 浅蓝 / 蓝 / 紫 / 粉 / 红 / 金 / 暗金） | 图 |
| `#cs 出售 abc123` | 出售单件（uid 至少前 4 位，仓库图每件下方有 6 位标识） | 文字 |
| `#cs 出售 全部` | 一键卖光所有库存 | 文字 |
| `#cs 出售 全部 蓝` | 只卖该品质（白/浅蓝/蓝/紫/粉/红/金） | 文字 |
| `#cs 记录` | 开箱历史 + 品质分布柱状图 + 最稀有掉落 | 图 |
| `#cs 概率` | 查看当前全局概率（所有人统一） | 文字 |
| `#cs 重置存档` | 清空自己的金币/库存/记录（60s 内连发 2 次确认） | 文字 |

### 管理员命令（仅主人）

| 命令 | 说明 |
|---|---|
| `#cs 更新数据` | 增量下载箱图/物品图（首次必跑；完成后自动刷新内存） |
| `#cs 更新数据 强制` | 强制重拉 `crates.json` 再下载 |
| `#cs 状态` | 查看下载任务实时进度 |
| `#cs 更新` | 从 git 仓库拉最新插件代码（拉完需重启 Yunzai 生效） |
| `#cs 概率预设 欧皇` | 切全局预设（默认/欧皇/极品/均匀/残酷），写入 `config.yaml` |
| `#cs 设置概率 红 1000` | 调全局单档（万分比），写入 `config.yaml` |

---

## 安装

### 1. 前置环境

| 依赖 | 说明 |
|---|---|
| Node.js ≥ 18 | Yunzai 本身要求 |
| TRSS-Yunzai | 已部署 |
| **ffmpeg** | 必须在系统 PATH（`ffmpeg -version` 能跑） |
| 中文字体 | Linux 服务器装 `fonts-noto-cjk`，否则视频/截图里中文是豆腐 |

在Yunzai根目录下执行：

```bash
git clone --depth=1 https://github.com/Cat-bl/cs-opener-plugin plugins/cs-opener-plugin
cd plugins/cs-opener-plugin
pnpm install
```

首次启动会自动从 `config_default/config.yaml` 拷贝一份到 `config/config.yaml`。

### 2. 配置代理（国内必看）

11000+ 张图从 GitHub raw + Steam CDN 拉，**国内不开代理基本下不动**。
Node 18+ 内置 fetch 不读 `HTTP_PROXY` 环境变量，必须在 `config/config.yaml` 里显式配：

```yaml
download:
  proxy: "http://127.0.0.1:7890"   # Clash / V2RayN 常用端口
  # proxy: "http://user:pass@host:port"  # 带认证
  # proxy: ""                       # 留空 = 直连（海外服务器）
  concurrency: 10
  retry: 3
```

### 3. 下载箱图/物品图（一次性，约 600MB）

**推荐：在 QQ 里发命令**（主人专属）：

```
#cs 更新数据
```

机器人会回执"开始下载，约 5–60 分钟"，期间可发 `#cs 状态` 查实时进度。
完成后自动加载新数据 + 推送总结，**不需要再做任何事**。

**或者：在服务器上手动跑** CLI（也走 config.yaml 的代理设置）：

```bash
cd TRSS-Yunzai/plugins/cs-opener-plugin
node tools/download_skins.mjs
# 或：HTTPS_PROXY=http://127.0.0.1:7890 node tools/download_skins.mjs
```

- 10 并发，约 20–60 分钟（视代理速度）
- 中断了再跑，已下载的文件会自动跳过

### 4. 试一下

QQ 私聊或群里发：

```
#cs 帮助
#cs 开箱 反冲武器箱
```

第二条命令若提示金币不足，会显示当前余额（默认 10000，开箱单价 17）。

---

## 配置

`config/config.yaml`（**保存即热更新，无需重启**）：

```yaml
initialCoins: 10000        # 新用户初始金币
sellPriceMultiplier: 1.0   # 售价倍率
dailyReward: 500           # 每日签到奖励金币
defaultOdds:               # 标准武器箱默认掉率（万分比，总和 100000）
  3: 79920                 # 军规级（蓝）
  4: 15980                 # 受限（紫）
  5: 3200                  # 保密（粉）
  6: 640                   # 隐秘（红）
  7: 260                   # 罕见特殊（金）
historyLimit: 500          # 单用户保留最近 N 条记录

video:
  fps: 60                  # 60 或 30；30 文件更小、速度更快
  introMs: 2000            # 预览页停留毫秒（物品多时自动延长到 4s 加滚动）
  revealMs: 5500           # 开箱结果停留毫秒
  width: 1280
  height: 720
  maxConcurrent: 2         # 同时生成的视频数（CPU 上限，建议 2-4）
  maxPending: 5            # 最大排队人数（超过直接拒绝并退款）

puppeteer:
  width: 1280
  height: 720
  scale: 1

cooldown:                  # 命令冷却（秒），置 0 = 不限
  open: 3                  # 开箱
  shop: 1                  # 商城
  case: 2                  # 单箱详情
  checkin: 1               # 签到
  inv: 1                   # 仓库

download:
  proxy: ""                # HTTP/HTTPS 代理，留空 = 直连
  concurrency: 10
  retry: 3
```

只需写覆盖项；未写的会自动用默认值。
**插件升级后 default 新增的字段会自动按位置插入到你的 `config/config.yaml`**（保留你已有的注释和改动），无需手动同步。

---

## 数据存储

- `data/users/{QQ号}.json` — 每人一份存档（金币 / 库存 / 历史 / 统计 / 默认箱 / 上次签到）
- 想给某人重置：删对应文件，或让 ta 发 `#cs 重置存档`（连发 2 次确认）
- 概率是**全局统一**的（只有主人能改，写入 `config.yaml`），不在用户存档里

---

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 命令无响应 | 看 Yunzai 控制台是否报 `[csgo-opener] xxx 加载失败` |
| 报「数据未初始化」 | 还没下载图片，主人发 `#cs 更新数据`（约 5–60 分钟） |
| `视频生成失败 / ffmpeg exit 127` | 系统 PATH 没 ffmpeg，或设 `FFMPEG=/path/to/ffmpeg` 环境变量 |
| 图片中文显示豆腐 | 装中文字体：`apt install fonts-noto-cjk` |
| 商城/详情图箱子是裂图 | `assets/skins/` 没下全，发 `#cs 更新数据` |
| `#cs 更新数据` 卡在 0% 不动 | 多半是没设代理。检查 `config/config.yaml` 的 `download.proxy`（国内基本必须） |
| 下载失败大量超时 | 代理速度不行；可改小 `download.concurrency` 到 5；或换代理 |
| `找不到箱子「xxx」` | 名字必须包含官方名子串，例如「反冲」即可匹配「反冲武器箱」 |
| 视频在群里发不出 | 文件本身只有 ~2MB，一般是 OneBot 适配器/群限速；私聊试试 |
| 多人同时开箱卡 | 已内置 ≤ 2 并发视频生成 + **每用户同时只能开 1 个箱**；高负载可升级 CPU 或在 config 改 `video.fps: 30` |
| 想增量更新新出的箱子 | 发 `#cs 更新数据 强制`（重拉 crates.json，完成后自动加载） |

---

## 项目结构

```
cs-opener-plugin/
├── index.js                  # 插件入口（自动加载 apps/）
├── apps/                     # 命令处理
│   ├── help.js / shop.js / case.js / open.js
│   ├── inventory.js / history.js / settings.js / checkin.js
│   ├── admin.js              # 主人命令（更新数据 / 状态）
│   └── update.js             # #cs 更新（git pull）
├── model/                    # 核心逻辑
│   ├── config.js             # YAML + chokidar 热更 + 启动自动补齐新字段
│   ├── data.js               # crates.json 加载/检索
│   ├── rarity.js             # 抽奖/品质/磨损/售价
│   ├── store.js              # 用户存档（per-uid promise queue 串行）
│   ├── cooldown.js           # 命令冷却（带自动清扫 stale entry）
│   ├── render.js             # puppeteer 渲染封装
│   ├── downloader.js         # 增量下载（undici ProxyAgent 走代理）
│   ├── html_helpers.js
│   └── video/                # 视频生成（canvas + ffmpeg）
│       ├── render.js / scenes.js / assets.js
│       └── easing.js / encode.js
├── config_default/
│   └── config.yaml           # 默认配置
├── config/                   # 用户配置（首启动自动从 default 拷贝）
├── resources/
│   ├── html/                 # puppeteer 模板
│   │   ├── help.html / shop.html / case-detail.html
│   │   └── inventory.html / history.html / checkin.html
│   └── css/                  # 模板样式
├── assets/                   # 静态资源
│   ├── data/crates.json      # 箱子元数据（从 ByMykel）
│   ├── skins/                # 箱图 + 物品图（~600MB，需下载）
│   ├── bg/                   # 10 张 CS 地图背景
│   ├── img/                  # 卡片背景 + 金色占位
│   └── audio/                # 11 个音效（开箱嘀嘀+品质中奖音）
├── tools/
│   ├── download_skins.mjs    # 下载 CLI（也可 #cs 更新数据）
│   ├── render_video.mjs      # 视频生成 CLI（调试）
│   └── render_html_test.mjs  # 模板渲染调试
└── data/                     # 运行时数据（gitignore）
    ├── users/{qq}.json
    └── tmp/                  # 视频临时输出（60s 后清理）
```

---

## 致谢

- **数据**：[ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) — 箱子/物品/品质元数据
- **音效**：CS 客户端原版
- **图片**：Steam CDN
- **框架**：[TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai)

---

## License

MIT
