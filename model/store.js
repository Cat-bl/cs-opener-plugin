/* 用户存档：按 QQ user_id 一个 JSON 文件
 * 路径: <plugin_root>/data/users/<uid>.json
 *
 * 字段:
 *   coins      金币
 *   inventory  数组（unshift on addItem，最新在前）
 *   history    数组（cap to historyLimit）
 *   stats      { opened, byNum:{1..7}, statTrakByNum:{1..7} }
 *   odds       null = 使用全局默认；否则 {3:n,4:n,5:n,6:n,7:n}
 *
 * 并发安全：每个 uid 一条 promise 队列，串行化 readModifyWrite
 */

import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Config from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(PLUGIN_ROOT, 'data', 'users')

if (!fss.existsSync(DATA_DIR)) fss.mkdirSync(DATA_DIR, { recursive: true })

function initial() {
  return {
    coins: Config.get().initialCoins ?? 10000,
    inventory: [],
    history: [],
    stats: {
      opened: 0,
      byNum:         { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
      statTrakByNum: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    },
    odds: null,
  }
}

const queues = new Map()

function runQueued(uid, fn) {
  const prev = queues.get(uid) || Promise.resolve()
  const next = prev.then(fn, fn)
  queues.set(uid, next.catch(() => {}))
  return next
}

function fileOf(uid) {
  return path.join(DATA_DIR, `${uid}.json`)
}

async function readRaw(uid) {
  try {
    const buf = await fs.readFile(fileOf(uid), 'utf8')
    return JSON.parse(buf)
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

async function writeRaw(uid, data) {
  const tmp = fileOf(uid) + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data), 'utf8')
  await fs.rename(tmp, fileOf(uid))
}

/* 读取 uid 存档；不存在返回 initial() */
export async function get(uid) {
  return runQueued(uid, async () => {
    const raw = await readRaw(uid)
    if (!raw) return initial()
    // 旧字段兜底
    raw.coins ??= Config.get().initialCoins ?? 10000
    raw.inventory ??= []
    raw.history ??= []
    raw.stats ??= initial().stats
    raw.stats.byNum ??= initial().stats.byNum
    raw.stats.statTrakByNum ??= initial().stats.statTrakByNum
    raw.odds ??= null
    return raw
  })
}

/* 用 mutator(data) 同步修改并写回，返回最新数据 */
export async function update(uid, mutator) {
  return runQueued(uid, async () => {
    const raw = (await readRaw(uid)) || initial()
    raw.coins ??= Config.get().initialCoins ?? 10000
    raw.inventory ??= []
    raw.history ??= []
    raw.stats ??= initial().stats
    raw.stats.byNum ??= initial().stats.byNum
    raw.stats.statTrakByNum ??= initial().stats.statTrakByNum
    raw.odds ??= null
    const ret = await mutator(raw)
    await writeRaw(uid, raw)
    return ret === undefined ? raw : ret
  })
}

export async function reset(uid) {
  return runQueued(uid, async () => {
    const data = initial()
    await writeRaw(uid, data)
    return data
  })
}

/* 高频快捷 mutator */

export async function spend(uid, amount) {
  return update(uid, d => {
    if (d.coins < amount) return { ok: false, coins: d.coins }
    d.coins -= amount
    return { ok: true, coins: d.coins }
  })
}

export async function earn(uid, amount) {
  return update(uid, d => { d.coins += amount; return d.coins })
}

export async function addDrop(uid, drop) {
  return update(uid, d => {
    d.inventory.unshift(drop)
    d.history.unshift(drop)
    const limit = Config.get().historyLimit ?? 500
    if (d.history.length > limit) d.history.length = limit
    d.stats.opened += 1
    d.stats.byNum[drop.rarityNum] = (d.stats.byNum[drop.rarityNum] || 0) + 1
    if (drop.isStatTrak) {
      d.stats.statTrakByNum[drop.rarityNum] = (d.stats.statTrakByNum[drop.rarityNum] || 0) + 1
    }
  })
}

/* 按 uid 前 N 位匹配 inventory 中的 item，返回 { item, index } 或 null */
export async function findInventoryByPrefix(uid, prefix) {
  const d = await get(uid)
  const p = (prefix || '').toLowerCase()
  if (!p) return null
  const idx = d.inventory.findIndex(it => it.uid && it.uid.toLowerCase().startsWith(p))
  if (idx < 0) return null
  return { item: d.inventory[idx], index: idx }
}

/* 出售：根据 uid 前缀找物品并出售，返回 { ok, price, item } */
export async function sellByPrefix(uid, prefix) {
  return update(uid, d => {
    const p = (prefix || '').toLowerCase()
    if (!p) return { ok: false, msg: '请提供 uid 前 6 位' }
    const idx = d.inventory.findIndex(it => it.uid && it.uid.toLowerCase().startsWith(p))
    if (idx < 0) return { ok: false, msg: '找不到该物品' }
    const item = d.inventory[idx]
    const price = (function () {
      // 内联 sellPriceOf 避免循环依赖
      const mult = Config.get().sellPriceMultiplier || 1
      const baseTable = { 1: 3, 2: 6, 3: 12, 4: 80, 5: 320, 6: 1500, 7: 8000 }
      const base = baseTable[item.rarityNum] || 12
      const wearMul = item.wear != null ? (1.5 - item.wear) : 1
      const stMul = item.isStatTrak ? 2 : 1
      return Math.max(1, Math.round(base * wearMul * stMul * mult))
    })()
    d.inventory.splice(idx, 1)
    d.coins += price
    return { ok: true, price, item, coins: d.coins }
  })
}
