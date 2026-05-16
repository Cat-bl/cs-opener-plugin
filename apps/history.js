import plugin from '../../../lib/plugins/plugin.js'
import { renderTpl } from '../model/render.js'
import * as Store from '../model/store.js'
import { RARITY, RARITY_NUMS_DESC } from '../model/rarity.js'
import { renderHistRow, userNickname, formatDate } from '../model/html_helpers.js'

export class CsgoHistory extends plugin {
  constructor() {
    super({
      name: 'CSGO记录',
      dsc: 'CS:GO 开箱历史 + 品质分布',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*csgo\\s*(记录|历史|统计)$', fnc: 'hist' },
      ],
    })
  }

  async hist(e) {
    const data = await Store.get(e.user_id)
    const opened = data.stats.opened || 0
    const recent = data.history.slice(0, 30)

    // 最稀有
    let rarest = null
    for (const it of data.history) {
      if (!rarest || it.rarityNum > rarest.rarityNum) rarest = it
    }

    // 统计卡片
    const byNum = data.stats.byNum || {}
    const total = opened || 1
    const segs = RARITY_NUMS_DESC.map(n => {
      const cnt = byNum[n] || 0
      const pct = (cnt / total * 100).toFixed(0)
      if (cnt === 0) return ''
      return `<div style="flex:${cnt};background:${RARITY[n].color}" title="${RARITY[n].name} ${cnt}"></div>`
    }).join('')

    const distLines = RARITY_NUMS_DESC.filter(n => (byNum[n] || 0) > 0).map(n => {
      const cnt = byNum[n] || 0
      const pct = (cnt / total * 100).toFixed(2)
      return `<div style="display:flex;justify-content:space-between;font-size:12px;color:#fff;margin:3px 0">
        <span><span style="display:inline-block;width:8px;height:8px;background:${RARITY[n].color};margin-right:6px;border-radius:1px"></span>${RARITY[n].name}</span>
        <span>${cnt} (${pct}%)</span>
      </div>`
    }).join('')

    const statsHtml = `
      <div class="hist-stat">
        <div class="hist-stat-label">总开箱</div>
        <div class="hist-stat-value">${opened}</div>
        <div class="hist-stat-sub">余额 ${data.coins}</div>
      </div>
      <div class="hist-stat" style="grid-column:span 2">
        <div class="hist-stat-label">品质分布</div>
        <div class="hist-rarity-bar">${segs}</div>
        <div style="margin-top:8px">${distLines || '<span style="color:#888">暂无</span>'}</div>
      </div>
      <div class="hist-stat">
        <div class="hist-stat-label">最稀有掉落</div>
        <div class="hist-stat-value" style="color:${rarest ? RARITY[rarest.rarityNum].color : '#fff'};font-size:15px;line-height:1.3">
          ${rarest ? (rarest.weapon + (rarest.paint ? ' | ' + rarest.paint : '')) : '暂无'}
        </div>
        <div class="hist-stat-sub">${rarest ? RARITY[rarest.rarityNum].name : ''}</div>
      </div>
    `

    const rowsHtml = recent.length
      ? recent.map(renderHistRow).join('')
      : `<div class="hist-empty">暂无开箱记录</div>`

    const height = Math.max(720, 280 + recent.length * 46)

    const img = await renderTpl('history', {
      userName: userNickname(e),
      coins: data.coins,
      opened,
      recentCount: recent.length,
      ts: formatDate(Date.now()),
      statsHtml,
      rowsHtml,
    }, { width: 1280, height })
    await e.reply(img)
    return true
  }
}
