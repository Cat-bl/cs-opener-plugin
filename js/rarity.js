/* ========== 品质、概率、磨损、StatTrak、图案模板 ==========
 *
 * 内部品质编号 1-7：
 *   1 消费级    color1  rgb(176,195,217)  白
 *   2 工业级    color2  rgb(94,152,217)   浅蓝
 *   3 军规级/高级    color3  rgb(75,105,255)   蓝
 *   4 受限/卓越      color4  rgb(126,71,255)   紫
 *   5 保密/奇异      color5  rgb(211,44,230)   粉
 *   6 隐秘/非凡      color6  rgb(235,75,75)    红
 *   7 罕见特殊        color7  rgb(255,215,0)    金（仅武器箱有）
 */

const RARITY = {
  1: { num: 1, key: 'consumer',   name: '消费级',   nameAlt: '消费级',   color: 'rgb(176,195,217)', sellPrice: 3 },
  2: { num: 2, key: 'industrial', name: '工业级',   nameAlt: '工业级',   color: 'rgb(94,152,217)',  sellPrice: 6 },
  3: { num: 3, key: 'milspec',    name: '军规级',   nameAlt: '高级',     color: 'rgb(75,105,255)',  sellPrice: 12 },
  4: { num: 4, key: 'restricted', name: '受限',     nameAlt: '卓越',     color: 'rgb(126,71,255)',  sellPrice: 80 },
  5: { num: 5, key: 'classified', name: '保密',     nameAlt: '奇异',     color: 'rgb(211,44,230)',  sellPrice: 320 },
  6: { num: 6, key: 'covert',     name: '隐秘',     nameAlt: '非凡',     color: 'rgb(235,75,75)',   sellPrice: 1500 },
  7: { num: 7, key: 'rare',       name: '罕见特殊', nameAlt: '罕见特殊', color: 'rgb(255,215,0)',   sellPrice: 8000 },
};

/* 标准武器箱默认概率（type=Case，万分比，总和 100000） */
const DEFAULT_ODDS = {
  3: 79920,
  4: 15980,
  5: 3200,
  6: 640,
  7: 260,
};
const ODDS_KEY = 'csgo_odds_v1';

function getUserOdds() {
  try {
    const raw = localStorage.getItem(ODDS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        return { 3: +o[3]||0, 4: +o[4]||0, 5: +o[5]||0, 6: +o[6]||0, 7: +o[7]||0 };
      }
    }
  } catch (e) { /* ignore */ }
  return Object.assign({}, DEFAULT_ODDS);
}
function getOdds() { return getUserOdds(); }
function setOdds(odds) { localStorage.setItem(ODDS_KEY, JSON.stringify(odds)); }
function resetOdds() { localStorage.removeItem(ODDS_KEY); }

/* 几何分配：相邻档比例 5:1（仿 CSGO 真实掉率）
 * 输入: tiers 数组 [3,4,5,6,7] 或子集
 * 输出: { num: weight } 对象（总和 100000）
 */
function geometricOdds(tiers) {
  if (!tiers || tiers.length === 0) return {};
  if (tiers.length === 1) return { [tiers[0]]: 100000 };
  // 从低到高排序
  const sorted = [...tiers].sort((a, b) => a - b);
  // weights: 最低档 5^(N-1), 最高档 1
  const N = sorted.length;
  const weights = sorted.map((_, idx) => Math.pow(5, N - 1 - idx));
  const sum = weights.reduce((s, w) => s + w, 0);
  const odds = {};
  sorted.forEach((num, i) => { odds[num] = Math.round(weights[i] / sum * 100000); });
  // 修正零头
  const diff = 100000 - Object.values(odds).reduce((s, v) => s + v, 0);
  odds[sorted[0]] += diff;
  return odds;
}

/* 按箱子实际有的档生成实际概率表
 * 优先级：
 *   - 标准武器箱（hasRare && 完整 3-7）→ 使用用户自定义/官方默认概率
 *   - 其它（纪念包/印花胶囊等）→ 按 presentTiers 几何分配
 */
function oddsForCase(caseObj) {
  if (!caseObj) return DEFAULT_ODDS;
  // 标准武器箱：tiers 是 3-7 子集 → 用 user odds（裁剪到实际存在的档）
  if (caseObj.category === 'weapon_case' && caseObj.hasRare) {
    const u = getUserOdds();
    const result = {};
    for (const n of caseObj.presentTiers) {
      if (u[n] != null) result[n] = u[n];
    }
    // 至少要有一项
    if (Object.keys(result).length === 0) return geometricOdds(caseObj.presentTiers);
    return result;
  }
  // 其它类型：根据 presentTiers 自动几何分配
  return geometricOdds(caseObj.presentTiers);
}

/* 抽一个品质编号
 * @param caseObj    箱子对象
 * @param capAt6     非中奖位封顶 6（永远不掷金）
 *                   且使用默认 5:1 几何分布（不受用户设置影响），避免视觉跑偏
 */
function rollRarityNumForCase(caseObj, capAt6) {
  if (!caseObj) return 3;
  let tiers = caseObj.presentTiers.slice();
  if (capAt6) tiers = tiers.filter(n => n < 7);
  if (tiers.length === 0) tiers = caseObj.presentTiers.slice();

  // 滚动条非中奖位强制几何分布；中奖位用 oddsForCase（含用户自定义）
  const odds = capAt6 ? geometricOdds(tiers) : oddsForCase(caseObj);
  const total = tiers.reduce((s, n) => s + (odds[n] || 0), 0);
  if (total <= 0) return tiers[0];
  const s = Math.random() * total;
  let acc = 0;
  for (const num of tiers) {
    acc += odds[num] || 0;
    if (s <= acc) return num;
  }
  return tiers[tiers.length - 1];
}

/* 兼容旧调用（默认武器箱标准 3-7） */
function rollRarityNum(capAt6) {
  const odds = capAt6 ? geometricOdds([3,4,5,6]) : getUserOdds();
  const tiers = capAt6 ? [3,4,5,6] : [3,4,5,6,7];
  const total = tiers.reduce((s, n) => s + (odds[n] || 0), 0);
  if (total <= 0) return 3;
  const s = Math.random() * total;
  let acc = 0;
  for (const num of tiers) {
    acc += odds[num] || 0;
    if (s <= acc) return num;
  }
  return tiers[tiers.length - 1];
}

function wearTierOf(value) {
  if (value <= 0.07) return { tier: 'FN', name: '崭新出厂' };
  if (value <= 0.15) return { tier: 'MW', name: '略有磨损' };
  if (value <= 0.38) return { tier: 'FT', name: '久经沙场' };
  if (value <= 0.45) return { tier: 'WW', name: '破损不堪' };
  return { tier: 'BS', name: '战痕累累' };
}
function rollStatTrak() { return Math.random() < 0.10; }
function rollPattern() { return Math.round(Math.random() * 1000); }

/* 从一个箱子完整抽取一个掉落 */
function rollDrop(caseObj) {
  const num = rollRarityNumForCase(caseObj, false);
  // 该档池
  let pool = caseObj.skinsByNum[num];
  if (!pool || pool.length === 0) {
    // 降级再升级查找
    for (let i = num - 1; i >= 1; i--) {
      if (caseObj.skinsByNum[i] && caseObj.skinsByNum[i].length) { pool = caseObj.skinsByNum[i]; break; }
    }
    if (!pool || pool.length === 0) {
      for (let i = num + 1; i <= 7; i++) {
        if (caseObj.skinsByNum[i] && caseObj.skinsByNum[i].length) { pool = caseObj.skinsByNum[i]; break; }
      }
    }
  }
  if (!pool || pool.length === 0) return null;
  const skin = pool[Math.floor(Math.random() * pool.length)];

  const hasWear = !!caseObj.hasWear;
  const wearVal = hasWear ? Math.random() : null;
  const w = hasWear ? wearTierOf(wearVal) : null;
  const isSt = caseObj.hasStatTrak && num !== 7 ? rollStatTrak() : false;

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
  };
}

function sellPriceOf(item) {
  const base = RARITY[item.rarityNum].sellPrice;
  const wearMul = item.wear != null ? (1.5 - item.wear) : 1;
  const stMul = item.isStatTrak ? 2 : 1;
  return Math.max(1, Math.round(base * wearMul * stMul));
}

/* ---------- 图片失败时的 SVG 兜底 ---------- */
function buildSkinFallbackSVG(weapon, paint, rarityNum) {
  const color = (RARITY[rarityNum] || RARITY[3]).color;
  const safeWeapon = String(weapon || '').replace(/[<>&]/g, '');
  const safePaint  = String(paint  || '').replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">
    <rect width="320" height="240" fill="#1a2029"/>
    <rect x="0" y="232" width="320" height="8" fill="${color}"/>
    <text x="160" y="115" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="900" fill="#fff" opacity=".9">${safeWeapon}</text>
    <text x="160" y="150" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#ddd" opacity=".75">${safePaint}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg).replace(/'/g, '%27');
}
function imgErrAttr(weapon, paint, rarityNum) {
  const fb = buildSkinFallbackSVG(weapon, paint, rarityNum);
  return `onerror="this.onerror=null;this.src='${fb}'"`;
}

const RARITY_NUMS_DESC = [7, 6, 5, 4, 3, 2, 1];
const RARITY_NUMS_ASC  = [1, 2, 3, 4, 5, 6, 7];
