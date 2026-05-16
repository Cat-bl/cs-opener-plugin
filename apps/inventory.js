import plugin from '../../../lib/plugins/plugin.js'
import { renderTpl } from '../model/render.js'
import * as Store from '../model/store.js'
import { rarityNumFromAlias, RARITY } from '../model/rarity.js'
import { renderInventoryCard, userNickname } from '../model/html_helpers.js'

export class CsgoInventory extends plugin {
  constructor() {
    super({
      name: 'CS仓库',
      dsc: 'CS 仓库 / 出售',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*cs\\s*(仓库|库存)(\\s+(.+))?$', fnc: 'inv' },
        { reg: '^#?\\s*cs\\s*出售\\s*(.+)$',           fnc: 'sell' },
      ],
    })
  }

  async inv(e) {
    const m = e.msg.match(/^#?\s*cs\s*(?:仓库|库存)(?:\s+(.+))?$/)
    const arg = (m && m[1] || '').trim()

    let filterNum = null
    let filterLabel = ''
    let onlyStatTrak = false
    if (arg) {
      const n = rarityNumFromAlias(arg)
      if (n === -1) { onlyStatTrak = true; filterLabel = 'StatTrak™' }
      else if (n != null) { filterNum = n; filterLabel = RARITY[n].name }
      else { await e.reply(`未知筛选「${arg}」。支持：白/浅蓝/蓝/紫/粉/红/金/暗金`); return true }
    }

    const data = await Store.get(e.user_id)
    let items = data.inventory
    if (filterNum != null) items = items.filter(it => it.rarityNum === filterNum)
    if (onlyStatTrak) items = items.filter(it => it.isStatTrak)

    const contentHtml = items.length
      ? `<div class="inv-grid">${items.map(renderInventoryCard).join('')}</div>`
      : `<div class="inv-empty"><div class="inv-empty-title">仓库空空如也</div><div>试试 #cs 开箱 反冲武器箱</div></div>`

    const rows = Math.ceil(items.length / 6)
    const height = Math.max(720, 180 + rows * 220)

    const img = await renderTpl('inventory', {
      userName: userNickname(e),
      filterLabel: filterLabel ? `<span class="inv-filter-label">${filterLabel}</span>` : '',
      coins: data.coins,
      count: items.length,
      contentHtml,
    }, { width: 720, height })
    await e.reply(img)
    return true
  }

  async sell(e) {
    const m = e.msg.match(/^#?\s*cs\s*出售\s*(.+)$/)
    const arg = (m && m[1] || '').trim()

    // 批量出售：「全部」/「全部 [品质]」
    const ma = arg.match(/^全部(?:\s+(\S+))?$/)
    if (ma) {
      const sub = ma[1]
      let filterNum = null, filterLabel = '全部'
      if (sub) {
        const n = rarityNumFromAlias(sub)
        if (n == null || n === -1) {
          await e.reply(`未知品质「${sub}」。支持：白/浅蓝/蓝/紫/粉/红/金`)
          return true
        }
        filterNum = n
        filterLabel = RARITY[n].name
      }
      const r = await Store.sellAll(e.user_id, filterNum)
      if (!r.ok) { await e.reply(r.msg); return true }
      await e.reply(`✅ 批量出售 [${filterLabel}] ${r.count} 件，获得 ${r.total} 金币\n余额 ${r.coins}，仓库剩 ${r.remaining} 件`)
      return true
    }

    // 单件出售：按 uid 前缀
    if (arg.length < 4) {
      await e.reply('请提供 uid 至少前 4 位（仓库图里每个物品下方有 6 位 uid 标识）\n或用 #cs 出售 全部 / #cs 出售 全部 蓝')
      return true
    }
    const r = await Store.sellByPrefix(e.user_id, arg)
    if (!r.ok) { await e.reply(r.msg || '出售失败'); return true }
    const it = r.item
    await e.reply(`已出售 ${it.weapon}${it.paint ? ' | ' + it.paint : ''}${it.isStatTrak ? ' (StatTrak™)' : ''}，获得 ${r.price} 金币，余额 ${r.coins}`)
    return true
  }
}
