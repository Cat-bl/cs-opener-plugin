import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import plugin from '../../../lib/plugins/plugin.js'
import { ensureDataReady, findCaseByName, getCases } from '../model/data.js'
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
        { reg: '^#?\\s*csgo\\s*开箱\\s*(.*)$',           fnc: 'open'    },
        { reg: '^#?\\s*csgo\\s*(选箱|默认箱)\\s*(.*)$', fnc: 'pickCase' },
      ],
    })
  }

  /* 只切换默认箱（不开箱、不扣金币）；无参数 = 查看当前 */
  async pickCase(e) {
    if (!(await ensureDataReady(e))) return true
    const m = e.msg.match(/^#?\s*csgo\s*(?:选箱|默认箱)\s*(.*)$/)
    const argName = (m && m[1] || '').trim()

    if (!argName) {
      const user = await Store.get(e.user_id)
      const cur = user.lastCase || '（未设置，默认开第一个武器箱）'
      await e.reply(`当前默认开箱: ${cur}\n用 #csgo 选箱 [箱名] 切换`)
      return true
    }
    const c = findCaseByName(argName)
    if (!c) { await e.reply(`找不到箱子「${argName}」`); return true }
    await Store.update(e.user_id, d => { d.lastCase = c.name })
    await e.reply(`✅ 默认箱已设为「${c.name}」(${c.price}金币/次)，之后 #csgo 开箱 直接开它`)
    return true
  }

  async open(e) {
    if (!(await ensureDataReady(e))) return true
    const m = e.msg.match(/^#?\s*csgo\s*开箱\s*(.*)$/)
    const argName = (m && m[1] || '').trim()

    // 决定箱子：参数 > 上次开的 > 默认第一个武器箱
    let c
    if (argName) {
      c = findCaseByName(argName)
      if (!c) { await e.reply(`找不到箱子「${argName}」`); return true }
    } else {
      const user = await Store.get(e.user_id)
      if (user.lastCase) c = findCaseByName(user.lastCase)
      if (!c) {
        const all = getCases()
        c = all.find(x => x.category === 'weapon_case') || all[0]
        if (!c) { await e.reply('暂无可用箱子，请先 #csgo 更新数据'); return true }
      }
    }

    // 扣金币 + 抽奖 + 写入库存 + 记 lastCase（全部串行，避免并发争抢同一存档）
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
      d.lastCase = c.name
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
