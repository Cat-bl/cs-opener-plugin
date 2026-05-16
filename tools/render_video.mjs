/* CLI 入口（开发调试用）：
 *   node tools/render_video.mjs --case "反冲武器箱" --rarity 7 --out out.mp4
 *
 * 实际渲染逻辑在 model/video/render.js
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCases, findCaseByName, getCases } from '../model/data.js'
import { rollDrop } from '../model/rarity.js'
import { renderOpenVideo } from '../model/video/render.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return def
  const v = args[i + 1]
  return (v && !v.startsWith('--')) ? v : true
}
const ARG_CASE   = arg('case', null)
const ARG_RARITY = arg('rarity', null) ? parseInt(arg('rarity'), 10) : null
const ARG_OUT    = arg('out', path.join(ROOT, 'out.mp4'))
const ARG_NO_AUD = !!arg('no-audio', false)
const ARG_FPS    = arg('fps', null) ? parseInt(arg('fps'), 10) : undefined

async function main() {
  console.log('[1/4] 加载箱子数据')
  await loadCases()
  const cases = getCases()
  console.log(`     共 ${cases.length} 个箱子`)

  let caseObj
  if (ARG_CASE) {
    caseObj = findCaseByName(ARG_CASE)
    if (!caseObj) throw new Error('找不到箱子: ' + ARG_CASE)
  } else {
    const weaponCases = cases.filter(c => c.category === 'weapon_case' && c.hasRare)
    caseObj = weaponCases.length ? weaponCases[Math.floor(Math.random() * weaponCases.length)] : cases[0]
  }
  console.log('     箱:', caseObj.name, '(tiers=' + caseObj.presentTiers.join(',') + ')')

  console.log('[2/4] 抽奖')
  const drop = rollDrop(caseObj, null, ARG_RARITY)
  console.log(`     中奖: ${drop.name} (r${drop.rarityNum} ${drop.rarityName})${drop.isStatTrak ? ' ST' : ''}`)

  console.log('[3/4] 渲染视频...')
  const t0 = Date.now()
  await renderOpenVideo(drop, caseObj, ARG_OUT, {
    fps: ARG_FPS, noAudio: ARG_NO_AUD,
  })
  console.log(`[4/4] 总耗时 ${((Date.now()-t0)/1000).toFixed(1)}s`)
  console.log('✅ 输出:', ARG_OUT)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
