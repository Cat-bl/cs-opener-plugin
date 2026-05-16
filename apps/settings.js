import { plugin } from '../model/yunzai.js'
import * as Store from '../model/store.js'
import { RARITY, ODDS_PRESETS, PRESET_ALIAS, rarityNumFromAlias, normalizeOdds, getDefaultOdds } from '../model/rarity.js'

const TIERS = [3, 4, 5, 6, 7]

function formatOdds(odds) {
  return TIERS.map(n => {
    const v = odds[n] || 0
    const pct = (v / 100000 * 100).toFixed(v >= 100 ? 2 : 4)
    return `  ${RARITY[n].name.padEnd(8, '　')} ${String(v).padStart(6)}/100000 (${pct}%)`
  }).join('\n')
}

export class CsgoSettings extends plugin {
  constructor() {
    super({
      name: 'CSGO概率',
      dsc: 'CS:GO 概率查看 / 设置 / 预设 / 重置',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#csgo\\s*(概率|我的概率)$',                       fnc: 'show' },
        { reg: '^#csgo\\s*概率预设\\s*(.+)$',                       fnc: 'preset' },
        { reg: '^#csgo\\s*设置概率\\s*(\\S+)\\s+(\\d+)$',           fnc: 'setOne' },
        { reg: '^#csgo\\s*重置(存档|存档)?$',                       fnc: 'reset' },
      ],
    })
  }

  async show(e) {
    const d = await Store.get(e.user_id)
    const odds = d.odds || getDefaultOdds()
    const isCustom = !!d.odds
    await e.reply(
      `【你的开箱概率】${isCustom ? '（自定义）' : '（默认 - 官方真实）'}\n${formatOdds(odds)}\n\n` +
      `预设：默认 / 欧皇 / 极品 / 均匀 / 残酷\n用法：#csgo 概率预设 欧皇`
    )
    return true
  }

  async preset(e) {
    const m = e.msg.match(/^#csgo\s*概率预设\s*(.+)$/)
    const name = (m && m[1] || '').trim()
    const key = PRESET_ALIAS[name] || PRESET_ALIAS[name.toLowerCase()]
    if (!key) {
      await e.reply(`未知预设「${name}」。可选：默认 / 欧皇 / 极品 / 均匀 / 残酷`)
      return true
    }
    await Store.update(e.user_id, d => { d.odds = { ...ODDS_PRESETS[key] } })
    const d = await Store.get(e.user_id)
    await e.reply(`已切换到预设「${name}」：\n${formatOdds(d.odds)}`)
    return true
  }

  async setOne(e) {
    const m = e.msg.match(/^#csgo\s*设置概率\s*(\S+)\s+(\d+)$/)
    const tierStr = m[1]
    const val = parseInt(m[2], 10)
    const num = rarityNumFromAlias(tierStr)
    if (num == null || num < 3 || num > 7) {
      await e.reply(`未知档位「${tierStr}」。可选：蓝/紫/粉/红/金 (或 军规级/受限/保密/隐秘/罕见特殊)`)
      return true
    }
    if (val < 0 || val > 100000) { await e.reply('值必须在 0–100000 之间'); return true }
    await Store.update(e.user_id, d => {
      d.odds = normalizeOdds({ ...(d.odds || getDefaultOdds()), [num]: val })
    })
    const d = await Store.get(e.user_id)
    await e.reply(`已设置 ${RARITY[num].name} = ${val} 并归一化:\n${formatOdds(d.odds)}`)
    return true
  }

  async reset(e) {
    await Store.reset(e.user_id)
    await e.reply('已重置存档（金币/库存/记录/概率全部回到初始状态）')
    return true
  }
}
