/* 每日签到 + 个人信息（共用 checkin.html 模板） */

import plugin from '../../../lib/plugins/plugin.js'
import Config from '../model/config.js'
import * as Store from '../model/store.js'
import { renderTpl } from '../model/render.js'
import { RARITY } from '../model/rarity.js'
import { escapeHtml, fileUrl, userNickname } from '../model/html_helpers.js'

function todayCST() {
  const d = new Date()
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000
  const cst = new Date(utcMs + 8 * 3600_000)
  return `${cst.getFullYear()}-${cst.getMonth() + 1}-${cst.getDate()}`
}
function nowCST() {
  const d = new Date()
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60_000
  const cst = new Date(utcMs + 8 * 3600_000)
  const pad = n => String(n).padStart(2, '0')
  return {
    dateBig: `${pad(cst.getMonth() + 1)}-${pad(cst.getDate())}`,
    timeSmall: `${cst.getFullYear()} ${pad(cst.getHours())}:${pad(cst.getMinutes())}`,
  }
}

/* 组装模板数据公共逻辑（签到 / 个人信息共用） */
function buildPageData(e, user, statusBlock) {
  const userName = userNickname(e)
  const firstChar = (userName.match(/[一-龥a-zA-Z0-9]/)?.[0] || '?').toUpperCase()
  const avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${e.user_id}&s=640`
  const { dateBig, timeSmall } = nowCST()

  // 最稀有掉落
  let rarest = null
  for (const it of user.history) if (!rarest || it.rarityNum > rarest.rarityNum) rarest = it
  let rarestHtml
  if (rarest) {
    const color = RARITY[rarest.rarityNum].color
    const name = rarest.weapon + (rarest.paint ? ' | ' + rarest.paint : '')
    rarestHtml = `
      <div class="rarest-card">
        <img class="rarest-img" src="${fileUrl(rarest.image)}" alt="">
        <div class="rarest-text">
          <div class="rarest-label">最稀有掉落</div>
          <div class="rarest-name" style="color:${color}">${escapeHtml(name)}${rarest.isStatTrak ? ' <span style="color:#cf6a32;font-size:14px">(StatTrak™)</span>' : ''}</div>
          <span class="rarest-tier" style="color:${color}">${RARITY[rarest.rarityNum].name}</span>
        </div>
      </div>`
  } else {
    rarestHtml = `
      <div class="rarest-card">
        <div class="rarest-text">
          <div class="rarest-label">最稀有掉落</div>
          <div class="rarest-name" style="color:rgba(255,255,255,.5);font-size:16px">还没开过箱 · 发 #cs 开箱 试试</div>
        </div>
      </div>`
  }

  return {
    avatarUrl,
    firstChar: escapeHtml(firstChar),
    userName: escapeHtml(userName),
    userId: e.user_id,
    dateBig, timeSmall,
    ...statusBlock,
    coins: user.coins,
    opened: user.stats.opened || 0,
    invCount: user.inventory.length,
    defaultCase: escapeHtml(user.lastCase || '未设置'),
    rarestHtml,
  }
}

export class CsgoCheckin extends plugin {
  constructor() {
    super({
      name: 'CS签到',
      dsc: 'CS 每日签到 / 个人信息',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*cs\\s*(签到|报到|每日)$',     fnc: 'checkin' },
        { reg: '^#?\\s*cs\\s*(我|个人|信息|资料)$', fnc: 'profile' },
      ],
    })
  }

  async checkin(e) {
    const reward = Config.get().dailyReward ?? 500
    const today = todayCST()
    const res = await Store.update(e.user_id, d => {
      if (d.lastCheckin === today) return { ok: false }
      d.lastCheckin = today
      d.coins += reward
      return { ok: true }
    })

    const user = await Store.get(e.user_id)
    const statusBlock = {
      statusCls: res.ok ? '' : 'failed',
      statusIcon: res.ok ? '✓' : '⏳',
      statusMsg: res.ok ? '签到成功' : '今日已签到',
      rewardHtml: res.ok
        ? `获得 <span class="num">+${reward}</span> 金币`
        : `<span style="color:rgba(255,255,255,.6)">明天再来 · 0 点重置</span>`,
      subMsg: res.ok
        ? `每日金币来源：签到 +${reward}  /  出售物品`
        : `下次签到将于 北京时间 00:00 重置`,
    }
    const img = await renderTpl('checkin', buildPageData(e, user, statusBlock), { width: 720, height: 1280 })
    await e.reply(img)
    return true
  }

  async profile(e) {
    const user = await Store.get(e.user_id)
    const today = todayCST()
    const signedToday = user.lastCheckin === today
    const statusBlock = {
      statusCls: 'failed',                  // 灰色头不显眼，作为信息态
      statusIcon: '★',
      statusMsg: '个人信息',
      rewardHtml: `当前余额 <span class="num">¥${user.coins}</span> 金币`,
      subMsg: signedToday
        ? `今日已签到 · 累计开箱 ${user.stats.opened || 0} 次`
        : `今日未签到 · 发 #cs 签到 领取奖励`,
    }
    const img = await renderTpl('checkin', buildPageData(e, user, statusBlock), { width: 720, height: 1280 })
    await e.reply(img)
    return true
  }
}
