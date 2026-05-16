import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import plugin from '../../../lib/plugins/plugin.js'
import { ensureDataReady, findCaseByName, getCases } from '../model/data.js'
import { rollDrop } from '../model/rarity.js'
import { getGroupOdds } from '../model/group_odds.js'
import * as Store from '../model/store.js'
import { renderOpenVideo } from '../model/video/render.js'
import { checkCooldown } from '../model/cooldown.js'
import Config from '../model/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const TMP_DIR = path.join(PLUGIN_ROOT, 'data', 'tmp')

/* 启动时清扫遗留 tmp（上次进程崩溃没清的 mp4） */
;(async () => {
  try {
    await fs.mkdir(TMP_DIR, { recursive: true })
    const files = await fs.readdir(TMP_DIR)
    let cleaned = 0
    for (const f of files) {
      if (f.startsWith('open_') && f.endsWith('.mp4')) {
        await fs.unlink(path.join(TMP_DIR, f)).catch(() => {})
        cleaned++
      }
    }
    if (cleaned > 0) console.log(`[csgo-opener] 清扫遗留视频 ${cleaned} 个`)
  } catch {}
})()

/* 同一用户同时只能开 1 个箱（避免重复扣费/排队混乱） */
const openingUsers = new Set()

/* 全局并发闸：同时最多 N 个视频生成（CPU/内存上限）；超过 maxPending 直接拒绝 */
let inFlight = 0
const pending = []

/* 撤回消息辅助：私聊/群聊都支持，N 秒后撤回 */
function scheduleRecall(e, msgRet, sec = 15) {
  if (!msgRet?.message_id) return
  setTimeout(() => {
    try {
      if (e.group?.recallMsg) e.group.recallMsg(msgRet.message_id).catch(() => {})
      else if (e.friend?.recallMsg) e.friend.recallMsg(msgRet.message_id).catch(() => {})
      else if (e.bot?.recallMsg) e.bot.recallMsg(msgRet.message_id).catch(() => {})
    } catch {}
  }, sec * 1000)
}

function queueStatus() {
  const cfg = Config.get().video || {}
  return { inFlight, pending: pending.length, max: cfg.maxConcurrent ?? 2, maxPending: cfg.maxPending ?? 5 }
}

function acquireSlot() {
  return new Promise(resolve => {
    const max = queueStatus().max
    const tryRun = () => {
      if (inFlight < max) { inFlight++; resolve(() => { inFlight--; pending.shift()?.() }) }
      else pending.push(tryRun)
    }
    tryRun()
  })
}

export class CsgoOpen extends plugin {
  constructor() {
    super({
      name: 'CS开箱',
      dsc: 'CS 模拟开箱（视频）',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*(?:cs\\s*)?开箱\\s*(.*)$',           fnc: 'open'     },
        { reg: '^#?\\s*(?:cs\\s*)?(选箱|默认箱)\\s*(.*)$', fnc: 'pickCase' },
      ],
    })
  }

  /* 只切换默认箱（不开箱、不扣金币）；无参数 = 查看当前 */
  async pickCase(e) {
    if (!(await ensureDataReady(e))) return true
    const m = e.msg.match(/^#?\s*(?:cs\s*)?(?:选箱|默认箱)\s*(.*)$/)
    const argName = (m && m[1] || '').trim()

    if (!argName) {
      const user = await Store.get(e.user_id)
      const cur = user.lastCase || '（未设置，默认开第一个武器箱）'
      await e.reply(`当前默认开箱: ${cur}\n用 #cs 选箱 [箱名] 切换`)
      return true
    }
    const c = findCaseByName(argName)
    if (!c) {
      await e.reply(`找不到箱子「${argName}」\n试试 #cs 商城 看完整列表`)
      return true
    }
    await Store.update(e.user_id, d => { d.lastCase = c.name })
    await e.reply(`✅ 默认箱已设为「${c.name}」(${c.price}金币/次)，之后 #cs 开箱 直接开它`)
    return true
  }

  async open(e) {
    // 每用户互斥：上次开箱还在跑就拒绝
    if (openingUsers.has(e.user_id)) {
      await e.reply('你上一次开箱还在进行中，等开完再发哦~', true)
      return true
    }

    const cd = checkCooldown('open', e.user_id)
    if (cd) { await e.reply(`开箱冷却中，${cd}s 后再试`); return true }
    if (!(await ensureDataReady(e))) return true
    const m = e.msg.match(/^#?\s*(?:cs\s*)?开箱\s*(.*)$/)
    const argName = (m && m[1] || '').trim()

    // 决定箱子：参数 > 上次开的 > 默认第一个武器箱
    let c
    if (argName) {
      c = findCaseByName(argName)
      if (!c) {
        await e.reply(`找不到箱子「${argName}」\n试试 #cs 商城 看完整列表\n名字支持包含匹配，例如「反冲」即可匹配「反冲武器箱」`)
        return true
      }
    } else {
      const user = await Store.get(e.user_id)
      if (user.lastCase) c = findCaseByName(user.lastCase)
      if (!c) {
        const all = getCases()
        c = all.find(x => x.category === 'weapon_case') || all[0]
        if (!c) { await e.reply('暂无可用箱子，请先 #cs 更新数据'); return true }
      }
    }

    // 锁住该用户（在金币校验前，避免重复扣费）
    openingUsers.add(e.user_id)
    try {
      // 读群概率（在 Store.update 外面，因为 update 回调是同步的）
      const groupOdds = e.group_id ? await getGroupOdds(e.group_id) : null

      // 扣金币 + 抽奖 + 写入库存 + 记 lastCase（全部串行，避免并发争抢同一存档）
      const result = await Store.update(e.user_id, d => {
        if (d.coins < c.price) return { ok: false, msg: `金币不足，需要 ${c.price}（当前 ${d.coins}）` }
        d.coins -= c.price
        const drop = rollDrop(c, groupOdds)   // 群概率 > 全局（rollDrop 内部 null 时用 config.defaultOdds）
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

      // 全局并发闸：满了/排队/无压力 三档处理
      const q = queueStatus()
      if (q.pending >= q.maxPending) {
        // 队列爆满：退款 + 拒绝
        await Store.update(e.user_id, d => { d.coins += c.price; d.inventory.shift(); d.history.shift(); d.stats.opened -= 1; d.stats.byNum[result.drop.rarityNum]-- })
        await e.reply(`⚠️ 服务器繁忙（${q.inFlight} 个开箱进行中 + ${q.pending} 个排队，已达上限），金币已退还，请稍后再试`)
        return true
      }

      // 引用回复"正在开箱中"提示，15s 后撤回
      // 单次视频生成约 18s（intro+spin+reveal+编码），有排队时叠加
      const baseSec = 20
      const ahead = q.inFlight + q.pending  // 我前面还排着几个
      const waitSec = (ahead + 1) * baseSec
      const tipRet = await e.reply(
        `开箱动画渲染中：${c.name}\n预计 ${waitSec}s 后送达${ahead > 0 ? `（前面 ${ahead} 个排队中）` : ''}`,
        true,
      ).catch(() => null)
      if (tipRet) scheduleRecall(e, tipRet, 15)

      await fs.mkdir(TMP_DIR, { recursive: true })
      const outPath = path.join(TMP_DIR, `open_${e.user_id}_${Date.now()}.mp4`)
      const cleanup = () => fs.unlink(outPath).catch(() => {})

      const release = await acquireSlot()
      try {
        const userName = e.sender?.nickname || e.sender?.card || e.member?.card || String(e.user_id)
        await renderOpenVideo(result.drop, c, outPath, { userName })
      } catch (err) {
        release()
        await cleanup()   // 立即删可能写了一半的文件
        await e.reply(`视频生成失败: ${err?.message || err}`)
        return true
      }
      release()

      try {
        await e.reply(segment.video(outPath))
        // 成功：给 QQ 留下载时间，60s 后删
        setTimeout(cleanup, 60000)
      } catch (err) {
        await cleanup()   // 发送失败也立即删
        await e.reply(`视频发送失败: ${err?.message || err}`)
      }
      return true
    } finally {
      openingUsers.delete(e.user_id)
    }
  }
}
