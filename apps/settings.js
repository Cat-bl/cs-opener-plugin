import plugin from '../../../lib/plugins/plugin.js'
import * as Store from '../model/store.js'
import { RARITY, ODDS_PRESETS, PRESET_ALIAS, rarityNumFromAlias, normalizeOdds, getDefaultOdds } from '../model/rarity.js'
import { getGroupOdds, setGroupOdds, resetGroupOdds } from '../model/group_odds.js'

const TIERS = [3, 4, 5, 6, 7]

function formatOdds(odds) {
  return TIERS.map(n => {
    const v = odds[n] || 0
    const pct = (v / 100000 * 100).toFixed(v >= 100 ? 2 : 4)
    return `  ${RARITY[n].name.padEnd(8, '　')} ${String(v).padStart(6)}/100000 (${pct}%)`
  }).join('\n')
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

  /* 任何人可查看：显示当前群/全局概率 */
  async show(e) {
    const { odds, source } = await effectiveOdds(e)
    await e.reply(
      `【当前开箱概率】（${source}）\n${formatOdds(odds)}\n\n` +
      `主人命令（群内生效）：\n` +
      `  #cs 概率预设 [默认/欧皇/极品/均匀/残酷]\n` +
      `  #cs 设置概率 [档] [万分比]\n` +
      `  #cs 重置概率（回退到全局默认）`
    )
    return true
  }

  /* 仅主人：切预设（群内 = 设该群；私聊 = 设全局） */
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
      await e.reply(`✅ 本群概率已切换到「${name}」:\n${formatOdds(odds)}`)
    } else {
      const Config = (await import('../model/config.js')).default
      const cfg = Config.get()
      cfg.defaultOdds = odds
      Config.save()
      await e.reply(`✅ 全局概率已切换到「${name}」（已写入 config.yaml）:\n${formatOdds(odds)}`)
    }
    return true
  }

  /* 仅主人：调单档 */
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
      await e.reply(`✅ 本群 ${RARITY[num].name} = ${val} 并归一化:\n${formatOdds(odds)}`)
    } else {
      const Config = (await import('../model/config.js')).default
      const cfg = Config.get()
      cfg.defaultOdds = normalizeOdds({ ...(cfg.defaultOdds || getDefaultOdds()), [num]: val })
      Config.save()
      await e.reply(`✅ 全局 ${RARITY[num].name} = ${val} 并归一化（已写入 config.yaml）:\n${formatOdds(cfg.defaultOdds)}`)
    }
    return true
  }

  /* 仅主人：重置本群概率（回退到全局） */
  async resetOdds(e) {
    if (!e.isMaster) { await e.reply('概率设置仅主人可用'); return true }
    if (!e.group_id) { await e.reply('私聊无群概率可重置，全局概率请直接改 config.yaml'); return true }
    await resetGroupOdds(e.group_id)
    await e.reply(`✅ 本群概率已重置，回退到全局默认:\n${formatOdds(getDefaultOdds())}`)
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
      setTimeout(() => {
        if (RESET_PENDING.get(e.user_id) === now) RESET_PENDING.delete(e.user_id)
      }, 60_000).unref?.()
      await e.reply('⚠️ 这将清空你的全部金币、库存、开箱记录（不可恢复）\n如确认，请在 60 秒内再发一次 #cs 重置存档')
    }
    return true
  }
}

const RESET_PENDING = new Map()
