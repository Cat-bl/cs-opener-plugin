# csgo-opener

> **CS:GO 模拟开箱** TRSS-Yunzai 插件 — 商城浏览 / 视频开箱 / 仓库管理 / 概率自定义 全套体验

[![ByMykel](https://img.shields.io/badge/data-ByMykel%2FCSGO--API-blue)](https://github.com/ByMykel/CSGO-API)

复刻 CS:GO 客户端开箱流程，包括 **6 秒滚动条 + 黄色指针 + 上下黑边 letterbox + 真实音效 + 金色全屏旋转光晕**。开箱以 MP4 视频形式发到群里，其余页面用 puppeteer 截图。

---

## 命令一览

> 所有命令以 `#csgo` 开头。

### 玩家命令

| 命令 | 说明 | 输出 |
|---|---|---|
| `#csgo` 或 `#csgo 帮助` | 命令清单 | 图 |
| `#csgo 商城` | 默认看武器箱 | 图 |
| `#csgo 商城 印花胶囊` | 切换类别<br>（武器箱 / 纪念包 / 高光纪念包 / 印花胶囊 / 签名胶囊 / 布章包 / 胸章胶囊 / 涂鸦箱 / 音乐盒集） | 图 |
| `#csgo 看 反冲武器箱` | 查看单个箱子详情（含全部物品+概率） | 图 |
| **`#csgo 开箱 反冲武器箱`** | **开一次箱** | **MP4 视频，约 14s** |
| `#csgo 仓库` | 自己全部库存 | 图 |
| `#csgo 仓库 红` | 按品质筛选（白 / 浅蓝 / 蓝 / 紫 / 粉 / 红 / 金 / 暗金） | 图 |
| `#csgo 出售 abc123` | 出售物品（uid 前 6 位） | 文字 |
| `#csgo 记录` | 开箱历史 + 品质分布柱状图 + 最稀有掉落 | 图 |
| `#csgo 概率` | 当前概率设置 | 文字 |
| `#csgo 概率预设 欧皇` | 切预设<br>（默认 / 欧皇 / 极品 / 均匀 / 残酷） | 文字 |
| `#csgo 设置概率 红 1000` | 单档调整（万分比；档位别名同筛选） | 文字 |
| `#csgo 重置存档` | 清空个人数据 | 文字 |

### 管理员命令（仅主人）

| 命令 | 说明 |
|---|---|
| `#csgo 更新数据` | 增量下载箱图/物品图（首次必跑；完成后自动刷新内存） |
| `#csgo 更新数据 强制` | 强制重拉 `crates.json` 再下载 |
| `#csgo 状态` | 查看下载任务实时进度 |

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
git clone --depth=1 https://github.com/Cat-bl/csgo-opener-plugin plugins/csgo-opener-plugin
cd plugins/csgo-opener-plugin
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
#csgo 更新数据
```

机器人会回执"开始下载，约 5–60 分钟"，期间可发 `#csgo 状态` 查实时进度。
完成后自动加载新数据 + 推送总结，**不需要再做任何事**。

**或者：在服务器上手动跑** CLI（也走 config.yaml 的代理设置）：

```bash
cd TRSS-Yunzai/plugins/csgo-opener
node tools/download_skins.mjs
# 或：HTTPS_PROXY=http://127.0.0.1:7890 node tools/download_skins.mjs
```

- 10 并发，约 20–60 分钟（视代理速度）
- 中断了再跑，已下载的文件会自动跳过

### 4. 试一下

QQ 私聊或群里发：

```
#csgo 帮助
#csgo 开箱 反冲武器箱
```

第二条命令若提示金币不足，会显示当前余额（默认 10000，开箱单价 17）。

---

## 配置

`config/config.yaml`（**保存即热更新，无需重启**）：

```yaml
initialCoins: 10000        # 新用户初始金币
sellPriceMultiplier: 1.0   # 售价倍率
defaultOdds:               # 标准武器箱默认掉率（万分比，总和 100000）
  3: 79920                 # 军规级（蓝）
  4: 15980                 # 受限（紫）
  5: 3200                  # 保密（粉）
  6: 640                   # 隐秘（红）
  7: 260                   # 罕见特殊（金）
historyLimit: 500          # 单用户保留最近 N 条记录

video:
  fps: 60                  # 60 或 30；30 文件更小、速度更快
  introMs: 2000            # 预览页停留毫秒
  revealMs: 5500           # 开箱结果停留毫秒
  width: 1280
  height: 720

puppeteer:
  width: 1280
  height: 720
  scale: 1

download:
  proxy: ""                # HTTP/HTTPS 代理，留空 = 直连
  concurrency: 10
  retry: 3
```

只需写覆盖项；未写的会自动用默认值。

---

## 数据存储

- `data/users/{QQ号}.json` — 每人一份存档（金币 / 库存 / 历史 / 统计 / 自定义概率）
- 想给某人重置：删对应文件，或让 ta 发 `#csgo 重置存档`
- 默认按 user_id 隔离，群内互不影响

---

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 命令无响应 | 看 Yunzai 控制台是否报 `[csgo-opener] xxx 加载失败` |
| `视频生成失败 / ffmpeg exit 127` | 系统 PATH 没 ffmpeg，或设 `FFMPEG=/path/to/ffmpeg` 环境变量 |
| 图片中文显示豆腐 | 装中文字体：`apt install fonts-noto-cjk` |
| 商城/详情图箱子是裂图 | `assets/skins/` 没下全，发 `#csgo 更新数据` |
| `#csgo 更新数据` 卡在 0% 不动 | 多半是没设代理。检查 `config/config.yaml` 的 `download.proxy`（国内基本必须） |
| 下载失败大量超时 | 代理速度不行；可改小 `download.concurrency` 到 5；或换代理 |
| `找不到箱子「xxx」` | 名字必须包含官方名子串，例如「反冲」即可匹配「反冲武器箱」 |
| 视频在群里发不出 | 文件本身只有 ~2MB，一般是 OneBot 适配器/群限速；私聊试试 |
| 多人同时开箱卡 | 已内置 ≤ 2 并发视频生成；高负载升级 CPU 或在 config 改 `video.fps: 30` |
| 想增量更新新出的箱子 | 发 `#csgo 更新数据 强制`（重拉 crates.json，完成后自动加载） |

---

## 项目结构

```
csgo-opener/
├── index.js                  # 插件入口（自动加载 apps/）
├── apps/                     # 命令处理
│   ├── help.js / shop.js / case.js / open.js
│   ├── inventory.js / history.js / settings.js
│   └── admin.js              # 主人命令
├── model/                    # 核心逻辑
│   ├── config.js             # YAML + chokidar 热更
│   ├── data.js               # crates.json 加载/检索
│   ├── rarity.js             # 抽奖/品质/磨损
│   ├── store.js              # 用户存档（per-uid 串行）
│   ├── render.js             # puppeteer 渲染封装
│   ├── downloader.js         # 增量下载
│   ├── html_helpers.js
│   ├── yunzai.js             # plugin / segment 引入（fallback 友好）
│   └── video/                # 视频生成（canvas + ffmpeg）
│       ├── render.js / scenes.js / assets.js
│       └── easing.js / encode.js
├── config_default/
│   └── config.yaml           # 默认配置
├── config/                   # 用户配置（首启动自动从 default 拷贝）
├── resources/
│   ├── html/                 # puppeteer 模板
│   │   ├── help.html / shop.html / case-detail.html
│   │   └── inventory.html / history.html
│   └── css/                  # 模板样式
├── assets/                   # 静态资源
│   ├── data/crates.json      # 箱子元数据（从 ByMykel）
│   ├── skins/                # 箱图 + 物品图（~600MB，需下载）
│   ├── bg/                   # 10 张 CS 地图背景
│   ├── img/                  # 卡片背景 + 金色占位
│   └── audio/                # 11 个音效（开箱嘀嘀+品质中奖音）
├── tools/
│   ├── download_skins.mjs    # 下载 CLI（也可 #csgo 更新数据）
│   ├── render_video.mjs      # 视频生成 CLI（调试）
│   └── render_html_test.mjs  # 模板渲染调试
└── data/                     # 运行时数据（gitignore）
    ├── users/{qq}.json
    └── tmp/                  # 视频临时输出（60s 后清理）
```

---

## 致谢

- **数据**：[ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API) — 箱子/物品/品质元数据
- **音效**：CS:GO 客户端原版
- **图片**：Steam CDN
- **框架**：[TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai)

---

## License

MIT
