/* ByMykel 箱图 + 物品图 增量下载器
 *
 *   await downloadAll({ onProgress, onLog, concurrency, maxRetry })
 *
 * onProgress({ done, total, okNew, okSkip, fail, bytes, percent })
 * onLog(msg)  — 可选；不传则不打印
 *
 * 完成返回 { okNew, okSkip, okRen, fail, bytes, elapsedMs, fails: [...] }
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashUrl } from './data.js'
import Config from './config.js'

/* 代理：config.download.proxy > env HTTPS_PROXY > env HTTP_PROXY > 直连
 * Node 18+ 内置 fetch 默认 不读 HTTP_PROXY 环境变量，必须显式给 undici 设 dispatcher
 */
let _dispatcher = null
async function resolveDispatcher() {
  if (_dispatcher !== null) return _dispatcher
  const cfgProxy = (Config.get().download?.proxy || '').trim()
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy
              || process.env.HTTP_PROXY  || process.env.http_proxy
  const proxy = cfgProxy || envProxy
  if (!proxy) { _dispatcher = false; return false }
  try {
    const { ProxyAgent } = await import('undici')
    _dispatcher = new ProxyAgent(proxy)
    return _dispatcher
  } catch (e) {
    // undici 未安装（Node < 18.x 老版本），回退直连
    _dispatcher = false
    return false
  }
}

async function pfetch(url, init = {}) {
  const d = await resolveDispatcher()
  return d ? fetch(url, { ...init, dispatcher: d }) : fetch(url, init)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
/* ByMykel 的真实仓库名仍是 CSGO-API（CS2 时代未改名）
 * 多镜像 fallback 顺序：国内 CDN/代理 → GitHub 原始（最后兜底）
 * 通常国内首条就成；如果有自己的代理走 download.proxy 配置，所有镜像都通过代理重试 */
const CRATES_URLS = [
  'https://fastly.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/zh-CN/crates.json',
  'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/zh-CN/crates.json',
  'https://gcore.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/zh-CN/crates.json',
  'https://mirror.ghproxy.com/https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/zh-CN/crates.json',
  'https://ghproxy.net/https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/zh-CN/crates.json',
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/zh-CN/crates.json',
]
const DATA_DIR    = path.join(PLUGIN_ROOT, 'assets', 'data')
const CACHE_JSON  = path.join(DATA_DIR, 'crates.json')
const CACHE_JS    = path.join(DATA_DIR, 'crates.js')
const CRATES_DIR  = path.join(PLUGIN_ROOT, 'assets', 'skins', 'crates')
const ITEMS_DIR   = path.join(PLUGIN_ROOT, 'assets', 'skins', 'items')

async function ensureDirs() {
  await fs.mkdir(DATA_DIR,   { recursive: true })
  await fs.mkdir(CRATES_DIR, { recursive: true })
  await fs.mkdir(ITEMS_DIR,  { recursive: true })
}

async function fileExists(p) {
  try { await fs.access(p); return true } catch { return false }
}

function basenameFromUrl(url) {
  return url.split('/').pop().split('?')[0]
}

async function loadCrates({ forceRemote = false, onLog }) {
  let txt
  if (!forceRemote) {
    try {
      txt = await fs.readFile(CACHE_JSON, 'utf8')
      onLog?.(`[json] 使用缓存 ${CACHE_JSON}`)
    } catch {}
  }
  if (!txt) {
    onLog?.('[json] 拉取 crates.json ...')
    const errs = []
    for (const url of CRATES_URLS) {
      try {
        onLog?.(`[json] try ${url}`)
        const resp = await pfetch(url)
        if (!resp.ok) { errs.push(`${url} → HTTP ${resp.status}`); continue }
        txt = await resp.text()
        onLog?.(`[json] 成功 (${(txt.length/1024).toFixed(0)} KB)`)
        break
      } catch (err) {
        errs.push(`${url} → ${err?.message || err}`)
      }
    }
    if (!txt) throw new Error('crates.json 全部镜像失败:\n  ' + errs.join('\n  '))
    await fs.writeFile(CACHE_JSON, txt, 'utf8')
    onLog?.(`[json] 已写入 ${CACHE_JSON}`)
  }
  // 同时写 JS 包装版（兼容老网页版离线加载，删除网页版后此文件可忽略）
  const jsWrap = `/* 由 model/downloader.js 生成 */\nwindow.__CS_CRATES__ = ${txt};\n`
  await fs.writeFile(CACHE_JS, jsWrap, 'utf8')
  return JSON.parse(txt)
}

function collectTargets(crates) {
  const targets = new Map()
  function add(url, dir, kind) {
    if (!url) return
    const oldFile = path.join(dir, basenameFromUrl(url))
    const newFile = path.join(dir, hashUrl(url) + '.png')
    targets.set(url, { url, oldFile, file: newFile, kind })
  }
  for (const c of crates) {
    if (!c || !Array.isArray(c.contains)) continue
    if (c.image) add(c.image, CRATES_DIR, 'crate')
    for (const s of c.contains) if (s && s.image) add(s.image, ITEMS_DIR, 'item')
    if (Array.isArray(c.contains_rare))
      for (const s of c.contains_rare) if (s && s.image) add(s.image, ITEMS_DIR, 'item')
  }
  return [...targets.values()]
}

async function downloadOne(target, maxRetry = 3) {
  if (await fileExists(target.file)) return { ok: true, skipped: true, size: 0 }
  if (target.oldFile && target.oldFile !== target.file && await fileExists(target.oldFile)) {
    try {
      await fs.rename(target.oldFile, target.file)
      return { ok: true, skipped: true, size: 0, renamed: true }
    } catch {}
  }
  let lastErr
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      const resp = await pfetch(target.url)
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const buf = Buffer.from(await resp.arrayBuffer())
      await fs.writeFile(target.file, buf)
      return { ok: true, skipped: false, size: buf.length }
    } catch (e) {
      lastErr = e
      if (attempt < maxRetry) await new Promise(r => setTimeout(r, 800 * attempt))
    }
  }
  return { ok: false, size: 0, url: target.url, err: lastErr?.message || 'unknown' }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length)
  let cursor = 0
  const lanes = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await worker(items[idx], idx + 1, items.length)
    }
  })
  await Promise.all(lanes)
  return results
}

export async function downloadAll({
  onProgress, onLog,
  concurrency, maxRetry, forceRemote = false,
} = {}) {
  const dlCfg = Config.get().download || {}
  concurrency = concurrency ?? dlCfg.concurrency ?? 10
  maxRetry    = maxRetry    ?? dlCfg.retry       ?? 3

  await ensureDirs()
  const d = await resolveDispatcher()
  if (d) onLog?.(`[proxy] 走代理 ${dlCfg.proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY}`)
  else   onLog?.('[proxy] 直连（如需代理见 config/config.yaml 的 download.proxy）')

  const crates = await loadCrates({ forceRemote, onLog })
  onLog?.(`[json] 共 ${crates.length} 个箱子`)
  const targets = collectTargets(crates)
  onLog?.(`[targets] 共 ${targets.length} 张图`)
  onLog?.(`[run] 并发=${concurrency}, 重试=${maxRetry}`)

  const t0 = Date.now()
  let done = 0, okNew = 0, okSkip = 0, okRen = 0, fail = 0, bytes = 0
  const fails = []
  let lastReport = 0

  const results = await runPool(targets, async (target, idx, total) => {
    const r = await downloadOne(target, maxRetry)
    done++
    if (r.ok && r.renamed) okRen++
    else if (r.ok && r.skipped) okSkip++
    else if (r.ok) { okNew++; bytes += r.size }
    else { fail++; fails.push(r) }

    // 节流上报（每 1s 或最后一张）
    const now = Date.now()
    if (now - lastReport >= 1000 || done === total) {
      lastReport = now
      onProgress?.({
        done, total, okNew, okSkip, okRen, fail, bytes,
        percent: +(done / total * 100).toFixed(1),
      })
    }
    return r
  }, concurrency)

  return {
    total: targets.length,
    okNew, okSkip, okRen, fail, bytes,
    elapsedMs: Date.now() - t0,
    fails,
  }
}
