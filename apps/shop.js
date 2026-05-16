import plugin from '../../../lib/plugins/plugin.js'
import { renderTpl } from '../model/render.js'
import { ensureDataReady, getCasesByCategory, findCategoryByLabel, CATEGORIES } from '../model/data.js'
import { renderCaseCard, formatDate } from '../model/html_helpers.js'

export class CsgoShop extends plugin {
  constructor() {
    super({
      name: 'CSGO商城',
      dsc: 'CS:GO 商城（按类别查看箱子）',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?\\s*csgo\\s*商城(\\s+(.+))?$', fnc: 'shop' },
      ],
    })
  }

  async shop(e) {
    if (!(await ensureDataReady(e))) return true
    const m = e.msg.match(/^#?\s*csgo\s*商城(?:\s+(.+))?$/)
    const arg = (m && m[1] || '').trim()

    let cat
    if (!arg) {
      cat = CATEGORIES[0]   // 默认武器箱
    } else {
      cat = findCategoryByLabel(arg)
      if (!cat) {
        const list = CATEGORIES.map(c => c.label).join(' / ')
        await e.reply(`找不到类别「${arg}」。可选：${list}`)
        return true
      }
    }

    const cases = getCasesByCategory(cat.key)
    const cardsHtml = cases.map(renderCaseCard).join('')

    const img = await renderTpl('shop', {
      categoryLabel: cat.label,
      caseCount: cases.length,
      ts: formatDate(Date.now()),
      cardsHtml,
    }, { width: 1280, height: Math.max(720, 230 + Math.ceil(cases.length / 5) * 230) })
    await e.reply(img)
    return true
  }
}
