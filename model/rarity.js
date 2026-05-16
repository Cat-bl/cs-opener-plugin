/* 品质表、概率分配、磨损、StatTrak、图案模板（Node 端） */

import Config from './config.js'

export const RARITY = {
  1: { num: 1, key: 'consumer',   name: '消费级',   nameAlt: '消费级',   color: 'rgb(176,195,217)', sellPrice: 3 },
  2: { num: 2, key: 'industrial', name: '工业级',   nameAlt: '工业级',   color: 'rgb(94,152,217)',  sellPrice: 6 },
  3: { num: 3, key: 'milspec',    name: '军规级',   nameAlt: '高级',     color: 'rgb(75,105,255)',  sellPrice: 12 },
  4: { num: 4, key: 'restricted', name: '受限',     nameAlt: '卓越',     color: 'rgb(126,71,255)',  sellPrice: 80 },
  5: { num: 5, key: 'classified', name: '保密',     nameAlt: '奇异',     color: 'rgb(211,44,230)',  sellPrice: 320 },
  6: { num: 6, key: 'covert',     name: '隐秘',     nameAlt: '非凡',     color: 'rgb(235,75,75)',   sellPrice: 1500 },
  7: { num: 7, key: 'rare',       name: '罕见特殊', nameAlt: '罕见特殊', color: 'rgb(255,215,0)',   sellPrice: 8000 },
}

/* 中文别名 → rarityNum，给用户命令用 */
export const RARITY_BY_ALIAS = {
  '白': 1, '消费级': 1, 'consumer': 1,
  '浅蓝': 2, '工业级': 2, 'industrial': 2,
  '蓝': 3, '军规级': 3, '高级': 3, 'milspec': 3,
  '紫': 4, '受限': 4, '卓越': 4, 'restricted': 4,
  '粉': 5, '保密': 5, '奇异': 5, 'classified': 5,
  '红': 6, '隐秘': 6, '非凡': 6, 'covert': 6,
  '金': 7, '罕见': 7, '罕见特殊': 7, 'rare': 7, 'gold': 7,
  'stattrak': -1, 'st': -1, '暗金': -1,
}

export function rarityNumFromAlias(s) {
  if (!s) return null
  const k = String(s).trim().toLowerCase()
  if (RARITY_BY_ALIAS[k] != null) return RARITY_BY_ALIAS[k]
  if (RARITY_BY_ALIAS[s] != null) return RARITY_BY_ALIAS[s]
  return null
}

/* ========== 概率 ========== */

export function getDefaultOdds() {
  return { ...(Config.get().defaultOdds || { 3:79920, 4:15980, 5:3200, 6:640, 7:260 }) }
}

/* 几何分配：相邻档比例 5:1 */
export function geometricOdds(tiers) {
  if (!tiers || tiers.length === 0) return {}
  if (tiers.length === 1) return { [tiers[0]]: 100000 }
  const sorted = [...tiers].sort((a, b) => a - b)
  const N = sorted.length
  const weights = sorted.map((_, idx) => Math.pow(5, N - 1 - idx))
  const sum = weights.reduce((s, w) => s + w, 0)
  const odds = {}
  sorted.forEach((num, i) => { odds[num] = Math.round(weights[i] / sum * 100000) })
  const diff = 100000 - Object.values(odds).reduce((s, v) => s + v, 0)
  odds[sorted[0]] += diff
  return odds
}

/* 按箱子实际有的档生成实际概率表 */
function oddsForCase(caseObj, userOdds) {
  if (!caseObj) return getDefaultOdds()
  if (caseObj.category === 'weapon_case' && caseObj.hasRare) {
    const u = userOdds || getDefaultOdds()
    const result = {}
    for (const n of caseObj.presentTiers) {
      if (u[n] != null) result[n] = u[n]
    }
    if (Object.keys(result).length === 0) return geometricOdds(caseObj.presentTiers)
    return result
  }
  return geometricOdds(caseObj.presentTiers)
}

/* 抽一个品质编号
 * @param caseObj    箱子对象
 * @param userOdds   用户自定义概率（可选；null 则用 config.defaultOdds）
 * @param capAt6     非中奖位封顶 6 + 强制几何分布
 */
export function rollRarityNumForCase(caseObj, userOdds, capAt6) {
  if (!caseObj) return 3
  let tiers = caseObj.presentTiers.slice()
  if (capAt6) tiers = tiers.filter(n => n < 7)
  if (tiers.length === 0) tiers = caseObj.presentTiers.slice()

  const odds = capAt6 ? geometricOdds(tiers) : oddsForCase(caseObj, userOdds)
  const total = tiers.reduce((s, n) => s + (odds[n] || 0), 0)
  if (total <= 0) return tiers[0]
  const s = Math.random() * total
  let acc = 0
  for (const num of tiers) {
    acc += odds[num] || 0
    if (s <= acc) return num
  }
  return tiers[tiers.length - 1]
}

export function wearTierOf(value) {
  if (value <= 0.07) return { tier: 'FN', name: '崭新出厂' }
  if (value <= 0.15) return { tier: 'MW', name: '略有磨损' }
  if (value <= 0.38) return { tier: 'FT', name: '久经沙场' }
  if (value <= 0.45) return { tier: 'WW', name: '破损不堪' }
  return { tier: 'BS', name: '战痕累累' }
}

function rollStatTrak() { return Math.random() < 0.10 }
function rollPattern()  { return Math.round(Math.random() * 1000) }

/* 从一个箱子完整抽取一个掉落 */
export function rollDrop(caseObj, userOdds, forceRarity) {
  let num = (forceRarity != null && caseObj.skinsByNum[forceRarity]?.length)
    ? forceRarity : rollRarityNumForCase(caseObj, userOdds, false)
  let pool = caseObj.skinsByNum[num]
  if (!pool || pool.length === 0) {
    for (let i = num - 1; i >= 1; i--) {
      if (caseObj.skinsByNum[i] && caseObj.skinsByNum[i].length) { pool = caseObj.skinsByNum[i]; num = i; break }
    }
    if (!pool || pool.length === 0) for (let i = num + 1; i <= 7; i++) {
      if (caseObj.skinsByNum[i] && caseObj.skinsByNum[i].length) { pool = caseObj.skinsByNum[i]; num = i; break }
    }
  }
  if (!pool || pool.length === 0) return null
  const skin = pool[Math.floor(Math.random() * pool.length)]

  const hasWear = !!caseObj.hasWear
  const wearVal = hasWear ? Math.random() : null
  const w = hasWear ? wearTierOf(wearVal) : null
  const isSt = caseObj.hasStatTrak && num !== 7 ? rollStatTrak() : false

  return {
    uid: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    id: skin.id,
    name: skin.name,
    weapon: skin.weapon,
    paint: skin.paint,
    image: skin.image,
    rarityNum: num,
    rarityName: RARITY[num].name,
    rarityColor: RARITY[num].color,
    wear: hasWear ? wearVal : null,
    wearTier: hasWear ? w.tier : null,
    wearTierName: hasWear ? w.name : null,
    pattern: caseObj.hasPattern ? rollPattern() : null,
    isStatTrak: isSt,
    obtainedAt: Date.now(),
    caseId: caseObj.id,
    caseName: caseObj.name,
    caseCategory: caseObj.category,
  }
}

export function sellPriceOf(item) {
  const mult = Config.get().sellPriceMultiplier || 1
  const base = RARITY[item.rarityNum].sellPrice
  const wearMul = item.wear != null ? (1.5 - item.wear) : 1
  const stMul = item.isStatTrak ? 2 : 1
  return Math.max(1, Math.round(base * wearMul * stMul * mult))
}

export const RARITY_NUMS_DESC = [7, 6, 5, 4, 3, 2, 1]
export const RARITY_NUMS_ASC  = [1, 2, 3, 4, 5, 6, 7]

/* ========== 概率预设 ========== */
export const ODDS_PRESETS = {
  default:  { 3: 79920, 4: 15980, 5: 3200, 6: 640, 7: 260 },        // 官方真实
  lucky:    { 3: 50000, 4: 30000, 5: 15000, 6: 4000, 7: 1000 },     // 欧皇
  god:      { 3: 20000, 4: 30000, 5: 30000, 6: 15000, 7: 5000 },    // 极品爆率
  balanced: { 3: 20000, 4: 20000, 5: 20000, 6: 20000, 7: 20000 },   // 均匀
  cruel:    { 3: 95000, 4: 4500, 5: 400, 6: 80, 7: 20 },            // 残酷（非洲酋长）
}

export const PRESET_ALIAS = {
  '默认': 'default', '官方': 'default', 'default': 'default',
  '欧皇': 'lucky',   '幸运': 'lucky',   'lucky': 'lucky',
  '极品': 'god',     '神豪': 'god',     'god': 'god',
  '均匀': 'balanced', 'balanced': 'balanced',
  '残酷': 'cruel',   '酋长': 'cruel',   '非洲': 'cruel', 'cruel': 'cruel',
}

export function normalizeOdds(odds) {
  const tiers = [3, 4, 5, 6, 7]
  const total = tiers.reduce((s, n) => s + (+odds[n] || 0), 0)
  if (total <= 0) return getDefaultOdds()
  const out = {}
  tiers.forEach(n => { out[n] = Math.round((+odds[n] || 0) / total * 100000) })
  out[3] += 100000 - tiers.reduce((s, n) => s + out[n], 0)
  return out
}
