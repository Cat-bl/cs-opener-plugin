/* 本地验证所有 puppeteer 模板：依次渲染并截图到 _check/ 下，肉眼对比布局
 *
 *   node tools/render_html_test.mjs
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadCases, getCasesByCategory, findCaseByName, CATEGORIES } from '../model/data.js'
import { rollDrop, RARITY, getDefaultOdds, RARITY_NUMS_ASC } from '../model/rarity.js'
import * as Store from '../model/store.js'
import { renderToFile } from '../model/render.js'
import {
  renderCaseCard, renderInventoryCard, renderDetailItem, renderHistRow,
  formatDate, fileUrl, randomBgUrl, pickGoldImageUrl, escapeHtml,
} from '../model/html_helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '..', '_check')

async function main() {
  await fs.mkdir(OUT, { recursive: true })
  await loadCases()

  // 1) help
  console.log('[1/5] help.html')
  await renderToFile('help', {}, path.join(OUT, '01_help.png'), { width: 720, height: 720 })

  // 2) shop（武器箱类别）
  console.log('[2/5] shop.html')
  const wcases = getCasesByCategory('weapon_case').slice(0, 18)
  await renderToFile('shop', {
    categoryLabel: '武器箱',
    caseCount: wcases.length,
    ts: formatDate(Date.now()),
    cardsHtml: wcases.map(renderCaseCard).join(''),
  }, path.join(OUT, '02_shop.png'), { width: 720, height: 1100 })

  // 3) case-detail（反冲武器箱）
  console.log('[3/5] case-detail.html')
  const c = findCaseByName('反冲武器箱')
  if (c) {
    const items = []
    for (const num of RARITY_NUMS_ASC) {
      for (const s of (c.skinsByNum[num] || [])) if (num !== 7) items.push(renderDetailItem({ ...s, rarityNum: num }))
    }
    const rareCount = (c.skinsByNum[7] || []).length
    if (rareCount > 0 && c.hasRare) {
      items.push(renderDetailItem({ paint: `${rareCount} 种刀/手套` }, true, pickGoldImageUrl(c).replace(/^file:\/\/\//, '')))
    }
    const odds = (c.category === 'weapon_case' && c.hasRare) ? getDefaultOdds() : {}
    const oddsHtml = c.presentTiers.map(n => {
      const pct = ((odds[n] || (100000/c.presentTiers.length)) / 100000 * 100).toFixed(2)
      return `<span class="odds-item"><span class="odds-dot" style="background:${RARITY[n].color}"></span>${RARITY[n].name} ${pct}%</span>`
    }).join('')
    await renderToFile('case-detail', {
      caseName: escapeHtml(c.name),
      categoryLabel: escapeHtml(c.categoryLabel),
      caseImg: fileUrl(c.image),
      bgUrl: randomBgUrl(),
      itemsHtml: items.join(''),
      itemsTotal: items.length,
      oddsHtml,
    }, path.join(OUT, '03_case_detail.png'), { width: 720, height: 1080 })
  }

  // 4) inventory（先开 5 次造点数据）
  console.log('[4/5] inventory.html')
  const TEST_UID = '_verify_test_uid'
  await Store.reset(TEST_UID)
  if (c) {
    for (let i = 0; i < 8; i++) {
      const drop = rollDrop(c, null)
      await Store.update(TEST_UID, d => {
        d.inventory.unshift(drop); d.history.unshift(drop); d.stats.opened++
        d.stats.byNum[drop.rarityNum]++
      })
    }
  }
  const data = await Store.get(TEST_UID)
  await renderToFile('inventory', {
    userName: 'TestUser',
    filterLabel: '',
    coins: data.coins,
    count: data.inventory.length,
    contentHtml: `<div class="inv-grid">${data.inventory.map(renderInventoryCard).join('')}</div>`,
  }, path.join(OUT, '04_inventory.png'), { width: 720, height: 720 })

  // 5) history
  console.log('[5/5] history.html')
  const byNum = data.stats.byNum
  const total = data.stats.opened || 1
  const segs = [7,6,5,4,3,2,1].map(n => {
    const cnt = byNum[n] || 0
    if (cnt === 0) return ''
    return `<div style="flex:${cnt};background:${RARITY[n].color}"></div>`
  }).join('')
  const distLines = [7,6,5,4,3,2,1].filter(n => (byNum[n]||0)>0).map(n => {
    const cnt = byNum[n] || 0
    const pct = (cnt / total * 100).toFixed(2)
    return `<div style="display:flex;justify-content:space-between;font-size:12px;color:#fff;margin:3px 0">
      <span><span style="display:inline-block;width:8px;height:8px;background:${RARITY[n].color};margin-right:6px"></span>${RARITY[n].name}</span>
      <span>${cnt} (${pct}%)</span>
    </div>`
  }).join('')
  let rarest = null
  for (const it of data.history) if (!rarest || it.rarityNum > rarest.rarityNum) rarest = it
  const statsHtml = `
    <div class="hist-stat">
      <div class="hist-stat-label">总开箱</div>
      <div class="hist-stat-value">${data.stats.opened}</div>
      <div class="hist-stat-sub">余额 ${data.coins}</div>
    </div>
    <div class="hist-stat" style="grid-column:span 2">
      <div class="hist-stat-label">品质分布</div>
      <div class="hist-rarity-bar">${segs}</div>
      <div style="margin-top:8px">${distLines}</div>
    </div>
    <div class="hist-stat">
      <div class="hist-stat-label">最稀有掉落</div>
      <div class="hist-stat-value" style="color:${rarest ? RARITY[rarest.rarityNum].color : '#fff'};font-size:15px">
        ${rarest ? (rarest.weapon + (rarest.paint ? ' | ' + rarest.paint : '')) : '暂无'}
      </div>
    </div>`
  await renderToFile('history', {
    userName: 'TestUser',
    coins: data.coins,
    opened: data.stats.opened,
    recentCount: data.history.length,
    ts: formatDate(Date.now()),
    statsHtml,
    rowsHtml: data.history.map(renderHistRow).join(''),
  }, path.join(OUT, '05_history.png'), { width: 720, height: 720 })

  // 清理测试存档
  await fs.unlink(path.resolve(__dirname, '..', 'data', 'users', TEST_UID + '.json')).catch(() => {})
  console.log('\n✅ 全部模板已渲染到 _check/')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
