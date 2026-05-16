import plugin from '../../../lib/plugins/plugin.js'
import * as Store from '../model/store.js'
import { renderTpl } from '../model/render.js'
import { RARITY, ODDS_PRESETS, PRESET_ALIAS, rarityNumFromAlias, normalizeOdds, getDefaultOdds } from '../model/rarity.js'
import { getGroupOdds, setGroupOdds, resetGroupOdds } from '../model/group_odds.js'

const TIERS = [3, 4, 5, 6, 7]

/* 构建概率图片数据 */
function buildOddsImage(odds, source, statusMsg) {
  const total = TIERS.reduce((s, n) => s + (odds[n] || 0), 0) || 1
  const maxVal = Math.max(...TIERS.map(n => odds[n] || 0))
  const rowsHtml = TIERS.map(n => {
    const v = odds[n] || 0
    const pct = (v / total * 100).toFixed(2)
    const barW = maxVal > 0 ? Math.max(2, v / maxVal * 100) : 0
    const color = RARITY[n].color
    return `
      <div class="odds-row">
        <div class="odds-dot" style="background:${color}"></div>
        <div class="odds-name" style="color:${color}">${RARITY[n].name}</div>
        <div class="odds-bar-wrap"><div class="odds-bar" style="width:${barW}%;background:${color}"></div></div>
        <div class="odds-val">${v} / ${total}</div>
        <div class="odds-pct" style="color:${color}">${pct}%</div>
      </div>`
  }).join('')

  const statusHtml = statusMsg
    ? `<div class="status-msg"><span class="icon">✅</span>${statusMsg}</div>`
    : ''

  const hintHtml = `主人命令（群内生效）：<br>` +
    `#cs 概率预设 [默认/欧皇/极品/均匀/残酷]<br>` +
    `#cs 设置概率 [档] [万分比]<br>` +
    `#cs 重置概率（回退到全局默认）`

  return { rowsHtml, statusHtml, sourceBadge: source, hintHtml }
}

/* 获取当前生效概率：群概率 > 全局 */
async function effectiveOdds(e) {
  if (e.group_id) {
    const go = await getGroupOdds(e.group_id)
    if (go) return { odds: go, source: '本群' }
  }
  return { odds: getDefaultOdds(), source: '全局默认' }
}

export class CsgoSettings extends plugin {
  constructor() {
    super({
      name: 'CS概率',
      dsc: 'CS 概率查看 / 设置（设置仅主人）/ 重置存档',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*cs\\s*(概率|当前概率)$',                       fnc: 'show' },
        { reg: '^#?\\s*cs\\s*概率预设\\s*(.+)$',                       fnc: 'preset' },
        { reg: '^#?\\s*cs\\s*设置概率\\s*(\\S+)\\s+(\\d+)$',           fnc: 'setOne' },
        { reg: '^#?\\s*cs\\s*重置概率$',                               fnc: 'resetOdds' },
        { reg: '^#?\\s*cs\\s*重置(存档)?$',                            fnc: 'reset' },
      ],
    })
  }

  async show(e) {
    const { odds, source } = await effectiveOdds(e)
    const data = buildOddsImage(odds, source, '')
    const img = await renderTpl('odds', data, { width: 720 })
    await e.reply(img)
    return true
  }

  async preset(e) {
    if (!e.isMaster) { await e.reply('概率设置仅主人可用'); return true }
    const m = e.msg.match(/^#?\s*cs\s*概率预设\s*(.+)$/)
    const name = (m && m[1] || '').trim()
    const key = PRESET_ALIAS[name] || PRESET_ALIAS[name.toLowerCase()]
    if (!key) {
      await e.reply(`未知预设「${name}」。可选：默认 / 欧皇 / 极品 / 均匀 / 残酷`)
      return true
    }
    const odds = { ...ODDS_PRESETS[key] }
    if (e.group_id) {
      await setGroupOdds(e.group_id, odds)
      const data = buildOddsImage(odds, '本群', `已切换到预设「${name}」`)
      const img = await renderTpl('odds', data, { width: 720 })
      await e.reply(img)
    } else {
      const Config = (await import('../model/config.js')).default
      const cfg = Config.get()
      cfg.defaultOdds = odds
      Config.save()
      const data = buildOddsImage(odds, '全局', `已切换到预设「${name}」（写入 config.yaml）`)
      const img = await renderTpl('odds', data, { width: 720 })
      await e.reply(img)
    }
    return true
  }

  async setOne(e) {
    if (!e.isMaster) { await e.reply('概率设置仅主人可用'); return true }
    const m = e.msg.match(/^#?\s*cs\s*设置概率\s*(\S+)\s+(\d+)$/)
    const tierStr = m[1]
    const val = parseInt(m[2], 10)
    const num = rarityNumFromAlias(tierStr)
    if (num == null || num < 3 || num > 7) {
      await e.reply(`未知档位「${tierStr}」。可选：蓝/紫/粉/红/金 (或 军规级/受限/保密/隐秘/罕见特殊)`)
      return true
    }
    if (val < 0 || val > 100000) { await e.reply('值必须在 0–100000 之间'); return true }

    if (e.group_id) {
      const cur = (await getGroupOdds(e.group_id)) || getDefaultOdds()
      const odds = normalizeOdds({ ...cur, [num]: val })
      await setGroupOdds(e.group_id, odds)
      const data = buildOddsImage(odds, '本群', `${RARITY[num].name} = ${val} 并归一化`)
      const img = await renderTpl('odds', data, { width: 720 })
      await e.reply(img)
    } else {
      const Config = (await import('../model/config.js')).default
      const cfg = Config.get()
      cfg.defaultOdds = normalizeOdds({ ...(cfg.defaultOdds || getDefaultOdds()), [num]: val })
      Config.save()
      const data = buildOddsImage(cfg.defaultOdds, '全局', `${RARITY[num].name} = ${val} 并归一化（写入 config.yaml）`)
      const img = await renderTpl('odds', data, { width: 720 })
      await e.reply(img)
    }
    return true
  }

  async resetOdds(e) {
    if (!e.isMaster) { await e.reply('概率设置仅主人可用'); return true }
    if (!e.group_id) { await e.reply('私聊无群概率可重置，全局概率请直接改 config.yaml'); return true }
    await resetGroupOdds(e.group_id)
    const odds = getDefaultOdds()
    const data = buildOddsImage(odds, '全局默认', '本群概率已重置，回退到全局')
    const img = await renderTpl('odds', data, { width: 720 })
    await e.reply(img)
    return true
  }

  async reset(e) {
    const last = RESET_PENDING.get(e.user_id) || 0
    const now = Date.now()
    if (now - last <= 60_000) {
      RESET_PENDING.delete(e.user_id)
      await Store.reset(e.user_id)
      await e.reply('✅ 已重置你的存档（金币/库存/记录回到初始状态）')
    } else {
      RESET_PENDING.set(e.user_id, now)
      setTimeout(() => {
        if (RESET_PENDING.get(e.user_id) === now) RESET_PENDING.delete(e.user_id)
      }, 60_000).unref?.()
      await e.reply('⚠️ 这将清空你的全部金币、库存、开箱记录（不可恢复）\n如确认，请在 60 秒内再发一次 #cs 重置存档')
    }
    return true
  }
}

const RESET_PENDING = new Map()
