/* 每日签到：每人每天可领一次金币（金币的主要来源） */

import plugin from '../../../lib/plugins/plugin.js'
import Config from '../model/config.js'
import * as Store from '../model/store.js'

function todayCST() {
  // 按 Asia/Shanghai 算"今天" YYYY-M-D
  const d = new Date()
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000
  const cst = new Date(utcMs + 8 * 3600_000)
  return `${cst.getFullYear()}-${cst.getMonth() + 1}-${cst.getDate()}`
}

export class CsgoCheckin extends plugin {
  constructor() {
    super({
      name: 'CSGO签到',
      dsc: 'CS:GO 每日签到（金币）',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*csgo\\s*(签到|报到|每日)$', fnc: 'checkin' },
      ],
    })
  }

  async checkin(e) {
    const reward = Config.get().dailyReward ?? 500
    const today = todayCST()
    const res = await Store.update(e.user_id, d => {
      if (d.lastCheckin === today) {
        return { ok: false, coins: d.coins }
      }
      d.lastCheckin = today
      d.coins += reward
      return { ok: true, coins: d.coins }
    })
    if (!res.ok) {
      await e.reply(`今日已签到。当前金币 ${res.coins}，明天再来`)
    } else {
      await e.reply(`✅ 签到成功 +${reward} 金币，当前余额 ${res.coins}\n（每日金币来源：签到 +${reward} / 出售物品。开箱花费按箱子价格）`)
    }
    return true
  }
}
