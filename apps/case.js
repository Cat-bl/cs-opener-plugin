import plugin from '../../../lib/plugins/plugin.js'
import { renderTpl } from '../model/render.js'
import { ensureDataReady, findCaseByName } from '../model/data.js'
import { RARITY, geometricOdds, getDefaultOdds, RARITY_NUMS_ASC } from '../model/rarity.js'
import { renderDetailItem, fileUrl, randomBgUrl, pickGoldImageUrl, escapeHtml } from '../model/html_helpers.js'
import { checkCooldown } from '../model/cooldown.js'

function oddsForDisplay(caseObj) {
  if (caseObj.category === 'weapon_case' && caseObj.hasRare) {
    const u = getDefaultOdds()
    const r = {}
    for (const n of caseObj.presentTiers) if (u[n] != null) r[n] = u[n]
    return r
  }
  return geometricOdds(caseObj.presentTiers)
}

export class CsgoCaseDetail extends plugin {
  constructor() {
    super({
      name: 'CSGO箱子详情',
      dsc: '查看单个箱子的全部物品和概率',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*csgo\\s*(看|查看|详情)\\s*(.+)$', fnc: 'detail' },
      ],
    })
  }

  async detail(e) {
    const cd = checkCooldown('case', e.user_id)
    if (cd) { await e.reply(`详情冷却中，${cd}s 后再试`); return true }
    if (!(await ensureDataReady(e))) return true
    const m = e.msg.match(/^#?\s*csgo\s*(?:看|查看|详情)\s*(.+)$/)
    const name = (m && m[1] || '').trim()
    const c = findCaseByName(name)
    if (!c) {
      await e.reply(`找不到箱子「${name}」\n试试 #csgo 商城 看完整列表\n名字支持包含匹配，例如「反冲」即可匹配「反冲武器箱」`)
      return true
    }

    // 物品列表（按品质升序，金色单独汇总）
    const items = []
    for (const num of RARITY_NUMS_ASC) {
      const list = c.skinsByNum[num] || []
      for (const s of list) {
        if (num !== 7) items.push(renderDetailItem({ ...s, rarityNum: num }))
      }
    }
    const rareCount = (c.skinsByNum[7] || []).length
    if (rareCount > 0 && c.hasRare) {
      items.push(renderDetailItem(
        { paint: `${rareCount} 种刀/手套` },
        true,
        pickGoldImageUrl(c).replace(/^file:\/\/\//, '')
      ))
    }

    // 概率条
    const odds = oddsForDisplay(c)
    const total = Object.values(odds).reduce((s, v) => s + v, 0) || 1
    const oddsHtml = c.presentTiers.map(n => {
      const pct = ((odds[n] || 0) / total * 100).toFixed(odds[n] >= 100 ? 1 : 3)
      return `<span class="odds-item"><span class="odds-dot" style="background:${RARITY[n].color}"></span>${RARITY[n].name} ${pct}%</span>`
    }).join('')

    const itemsTotal = c.presentTiers.reduce((s, n) => s + (c.skinsByNum[n]?.length || 0), 0)

    const img = await renderTpl('case-detail', {
      caseName: escapeHtml(c.name),
      categoryLabel: escapeHtml(c.categoryLabel || '开 箱'),
      caseImg: fileUrl(c.image),
      bgUrl: randomBgUrl(),
      itemsHtml: items.join(''),
      itemsTotal,
      oddsHtml,
    }, { width: 1280, height: 1080 })  // 详情页较长，放大高度
    await e.reply(img)
    return true
  }
}
