import plugin from '../../../lib/plugins/plugin.js'
import Config from '../model/config.js'
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
      dsc: 'CS:GO 概率查看 / 设置（设置仅主人）/ 重置存档',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*csgo\\s*(概率|当前概率)$',                       fnc: 'show' },
        { reg: '^#?\\s*csgo\\s*概率预设\\s*(.+)$',                       fnc: 'preset' },
        { reg: '^#?\\s*csgo\\s*设置概率\\s*(\\S+)\\s+(\\d+)$',           fnc: 'setOne' },
        { reg: '^#?\\s*csgo\\s*重置(存档)?$',                            fnc: 'reset' },
      ],
    })
  }

  /* 任何人可查看：显示全局当前概率（主人设置后所有人用同一份） */
  async show(e) {
    const odds = getDefaultOdds()
    await e.reply(
      `【当前开箱概率】（全局，仅主人可改）\n${formatOdds(odds)}\n\n` +
      `主人命令：#csgo 概率预设 [默认/欧皇/极品/均匀/残酷]\n` +
      `         #csgo 设置概率 [档] [万分比]`
    )
    return true
  }

  /* 仅主人：切预设并保存到 config.yaml */
  async preset(e) {
    if (!e.isMaster) { await e.reply('概率设置仅主人可用'); return true }
    const m = e.msg.match(/^#?\s*csgo\s*概率预设\s*(.+)$/)
    const name = (m && m[1] || '').trim()
    const key = PRESET_ALIAS[name] || PRESET_ALIAS[name.toLowerCase()]
    if (!key) {
      await e.reply(`未知预设「${name}」。可选：默认 / 欧皇 / 极品 / 均匀 / 残酷`)
      return true
    }
    const cfg = Config.get()
    cfg.defaultOdds = { ...ODDS_PRESETS[key] }
    Config.save()
    await e.reply(`✅ 全局概率已切换到「${name}」（已写入 config.yaml）:\n${formatOdds(cfg.defaultOdds)}`)
    return true
  }

  /* 仅主人：调单档并保存 */
  async setOne(e) {
    if (!e.isMaster) { await e.reply('概率设置仅主人可用'); return true }
    const m = e.msg.match(/^#?\s*csgo\s*设置概率\s*(\S+)\s+(\d+)$/)
    const tierStr = m[1]
    const val = parseInt(m[2], 10)
    const num = rarityNumFromAlias(tierStr)
    if (num == null || num < 3 || num > 7) {
      await e.reply(`未知档位「${tierStr}」。可选：蓝/紫/粉/红/金 (或 军规级/受限/保密/隐秘/罕见特殊)`)
      return true
    }
    if (val < 0 || val > 100000) { await e.reply('值必须在 0–100000 之间'); return true }
    const cfg = Config.get()
    cfg.defaultOdds = normalizeOdds({ ...(cfg.defaultOdds || getDefaultOdds()), [num]: val })
    Config.save()
    await e.reply(`✅ 已设全局 ${RARITY[num].name} = ${val} 并归一化（已写入 config.yaml）:\n${formatOdds(cfg.defaultOdds)}`)
    return true
  }

  /* 用户重置自己存档：60s 内连发两次才执行（防误触） */
  async reset(e) {
    const last = RESET_PENDING.get(e.user_id) || 0
    const now = Date.now()
    if (now - last <= 60_000) {
      RESET_PENDING.delete(e.user_id)
      await Store.reset(e.user_id)
      await e.reply('✅ 已重置你的存档（金币/库存/记录回到初始状态）')
    } else {
      RESET_PENDING.set(e.user_id, now)
      await e.reply('⚠️ 这将清空你的全部金币、库存、开箱记录（不可恢复）\n如确认，请在 60 秒内再发一次 #csgo 重置存档')
    }
    return true
  }
}

/* uid → 上次发"重置"的时间戳；超过 60s 视为新一次首发 */
const RESET_PENDING = new Map()
