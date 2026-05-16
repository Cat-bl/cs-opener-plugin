import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import plugin from '../../../lib/plugins/plugin.js'
import { loadCases, findCaseByName } from '../model/data.js'
import { rollDrop } from '../model/rarity.js'
import * as Store from '../model/store.js'
import { renderOpenVideo } from '../model/video/render.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const TMP_DIR = path.join(PLUGIN_ROOT, 'data', 'tmp')

// 简易并发闸：同时最多 N 个视频生成（ffmpeg + canvas 都吃 CPU）
const MAX_CONCURRENT = 2
let inFlight = 0
const pending = []
function acquireSlot() {
  return new Promise(resolve => {
    const tryRun = () => {
      if (inFlight < MAX_CONCURRENT) { inFlight++; resolve(() => { inFlight--; pending.shift()?.() }) }
      else pending.push(tryRun)
    }
    tryRun()
  })
}

export class CsgoOpen extends plugin {
  constructor() {
    super({
      name: 'CSGO开箱',
      dsc: 'CS:GO 模拟开箱（视频）',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#csgo\\s*开箱\\s*(.+)$', fnc: 'open' },
      ],
    })
  }

  async open(e) {
    await loadCases()
    const m = e.msg.match(/^#csgo\s*开箱\s*(.+)$/)
    const name = (m && m[1] || '').trim()
    const c = findCaseByName(name)
    if (!c) { await e.reply(`找不到箱子「${name}」`); return true }

    // 扣金币 + 抽奖 + 写入库存（全部串行，避免并发争抢同一存档）
    const result = await Store.update(e.user_id, d => {
      if (d.coins < c.price) return { ok: false, msg: `金币不足，需要 ${c.price}（当前 ${d.coins}）` }
      d.coins -= c.price
      const drop = rollDrop(c, d.odds)
      d.inventory.unshift(drop)
      d.history.unshift(drop)
      d.stats.opened += 1
      d.stats.byNum[drop.rarityNum] = (d.stats.byNum[drop.rarityNum] || 0) + 1
      if (drop.isStatTrak) {
        d.stats.statTrakByNum[drop.rarityNum] = (d.stats.statTrakByNum[drop.rarityNum] || 0) + 1
      }
      return { ok: true, drop, coins: d.coins }
    })
    if (!result.ok) { await e.reply(result.msg); return true }

    await fs.mkdir(TMP_DIR, { recursive: true })
    const outPath = path.join(TMP_DIR, `open_${e.user_id}_${Date.now()}.mp4`)

    const release = await acquireSlot()
    try {
      await renderOpenVideo(result.drop, c, outPath)
    } catch (err) {
      release()
      await e.reply(`视频生成失败: ${err?.message || err}`)
      return true
    }
    release()

    try {
      await e.reply(segment.video(outPath))
    } finally {
      // 60s 后清理临时文件
      setTimeout(() => fs.unlink(outPath).catch(() => {}), 60000)
    }
    return true
  }
}
