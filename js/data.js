/* ========== 所有可开盒子数据 (ByMykel CSGO-API) ==========
 *
 * 涵盖 9 类共 475 个：
 *   武器箱 / 纪念包 / 高光纪念包 / 印花胶囊 / 签名胶囊 / 布章包 / 胸章胶囊 / 涂鸦箱 / 音乐盒
 *
 * 数据源 https://github.com/ByMykel/CSGO-API
 * 端点   https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/zh-CN/crates.json
 *
 * 内部品质编号 1-7（消费/工业/军规/受限/保密/隐秘/罕见特殊金）
 * 不同类型的盒子里只用一部分档：
 *   武器箱      contains 3-6 + contains_rare 7
 *   纪念包      contains 1-6（无 7）
 *   印花胶囊    contains 3-6（rarity_rare/mythical/legendary/ancient → 高级/卓越/奇异/非凡）
 *   ...
 */

const CRATES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/zh-CN/crates.json';
const CACHE_KEY = 'csgo_crates_v3';
const CACHE_TTL = 24 * 3600 * 1000;

/* 把 ByMykel/Steam CDN URL 重写成本地 assets/skins/{crates|items}/{hash}.png
 * 用 URL 的 64-bit FNV-1a hash 做短文件名，避开 Steam Akamai 200+ 字符 base64
 * basename 导致 Windows MAX_PATH=260 超长无法读取的问题。
 * 脚本端用同一 hash 算法（tools/download_skins.mjs 的 hashUrl）。 */
function hashUrl(url) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < url.length; i++) {
    h ^= BigInt(url.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}
function rewriteToLocal(url, kind /* 'crate' | 'item' */) {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith('http')) return url;
  return `assets/skins/${kind === 'crate' ? 'crates' : 'items'}/${hashUrl(url)}.png`;
}

/* ByMykel rarity.id → 数字 1-7（用于 contains 中的普通物品） */
const RARITY_NUM_MAP = {
  /* 武器系列（消费~隐秘） */
  'rarity_common_weapon':    1,
  'rarity_uncommon_weapon':  2,
  'rarity_rare_weapon':      3,
  'rarity_mythical_weapon':  4,
  'rarity_legendary_weapon': 5,
  'rarity_ancient_weapon':   6,
  /* 印花/胶囊/挂件系列（高级~非凡） */
  'rarity_rare':             3,
  'rarity_mythical':         4,
  'rarity_legendary':        5,
  'rarity_ancient':          6,
  /* 探员（如果出现） */
  'rarity_rare_character':       3,
  'rarity_mythical_character':   4,
  'rarity_legendary_character':  5,
  'rarity_ancient_character':    6,
  /* 违禁 */
  'rarity_contraband':       7,
  'rarity_immortal':         7,
};

/* ByMykel container.type → 内部 category */
const CATEGORY_MAP = {
  'Case':                'weapon_case',
  'Souvenir':            'souvenir',
  'Souvenir Highlight':  'highlight',
  'Sticker Capsule':     'sticker',
  'Autograph Capsule':   'autograph',
  'Patch Capsule':       'patch',
  'Pins':                'pin',
  'Graffiti':            'graffiti',
  'Music Kit Box':       'musickit',
};

/* 用于商城分类 tab 的元数据 */
const CATEGORIES = [
  { key: 'weapon_case',  label: '武器箱',       priceLabel: '钥匙 ¥17',  hasWear: true,  hasStatTrak: true,  hasPattern: true  },
  { key: 'souvenir',     label: '纪念包',       priceLabel: '¥17',       hasWear: true,  hasStatTrak: false, hasPattern: true  },
  { key: 'highlight',    label: '高光纪念包',   priceLabel: '¥17',       hasWear: true,  hasStatTrak: false, hasPattern: true  },
  { key: 'sticker',      label: '印花胶囊',     priceLabel: '¥7',        hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'autograph',    label: '签名胶囊',     priceLabel: '¥15',       hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'patch',        label: '布章包',       priceLabel: '¥7',        hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'pin',          label: '胸章胶囊',     priceLabel: '¥7',        hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'graffiti',     label: '涂鸦箱',       priceLabel: '¥3',        hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'musickit',     label: '音乐盒集',     priceLabel: '¥17',       hasWear: false, hasStatTrak: true,  hasPattern: false },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

function priceForCategory(catKey) {
  const meta = CATEGORY_BY_KEY[catKey];
  if (!meta) return 17;
  const m = (meta.priceLabel.match(/(\d+)/) || [])[1];
  return m ? parseInt(m, 10) : 17;
}

let CASES = [];
let _ready = false;
const _readyCallbacks = [];
function onReady(fn) {
  if (_ready) fn();
  else _readyCallbacks.push(fn);
}

async function loadCases() {
  let raw;
  // 1) 优先：tools/download_skins.mjs 生成的本地 JS 包（assets/data/crates.js）
  if (Array.isArray(window.__CSGO_CRATES__)) {
    raw = window.__CSGO_CRATES__;
  }
  // 2) 其次：localStorage 24h 缓存
  if (!raw) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj && obj.ts && (Date.now() - obj.ts < CACHE_TTL) && Array.isArray(obj.data)) {
          raw = obj.data;
        }
      }
    } catch (e) { /* ignore */ }
  }
  // 3) 兜底：远程拉取（需联网/代理）
  if (!raw) {
    const resp = await fetch(CRATES_URL);
    if (!resp.ok) throw new Error('crates.json 加载失败 ' + resp.status);
    raw = await resp.json();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: raw })); }
    catch (e) { /* localStorage 可能满 */ }
  }

  CASES = processCrates(raw);
  _ready = true;
  _readyCallbacks.forEach(fn => fn());
}

function processCrates(raw) {
  return raw
    .filter(c => c && c.type && CATEGORY_MAP[c.type] && Array.isArray(c.contains) && c.contains.length > 0)
    .map(c => {
      const category = CATEGORY_MAP[c.type];
      const meta = CATEGORY_BY_KEY[category];
      const byNum = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };

      for (const s of c.contains) {
        const num = RARITY_NUM_MAP[s.rarity ? s.rarity.id : ''] || 3;
        byNum[num].push(toSkin(s));
      }
      let hasRare = false;
      if (Array.isArray(c.contains_rare) && c.contains_rare.length > 0) {
        for (const s of c.contains_rare) byNum[7].push(toSkin(s));
        hasRare = true;
      }

      // 计算该箱在 1-7 中实际有哪些档
      const presentTiers = [];
      for (let n = 1; n <= 7; n++) if (byNum[n].length > 0) presentTiers.push(n);

      return {
        id: c.id,
        name: c.name,
        image: rewriteToLocal(c.image, 'crate'),
        firstSaleDate: c.first_sale_date,
        marketName: c.market_hash_name,
        category: category,
        categoryLabel: meta.label,
        hasWear: meta.hasWear,
        hasStatTrak: meta.hasStatTrak,
        hasPattern: meta.hasPattern,
        hasRare: hasRare,
        price: priceForCategory(category),
        skinsByNum: byNum,
        presentTiers: presentTiers,
      };
    })
    .filter(c => c.presentTiers.length > 0)
    .sort((a, b) => {
      // 同类别按时间倒序，类别按 CATEGORIES 顺序
      const ca = CATEGORIES.findIndex(x => x.key === a.category);
      const cb = CATEGORIES.findIndex(x => x.key === b.category);
      if (ca !== cb) return ca - cb;
      return (b.firstSaleDate || '').localeCompare(a.firstSaleDate || '');
    });
}

function toSkin(s) {
  // 极少数条目 name 是数字（如印花 "42" / "6"），统一转字符串
  const rawName = s.name == null ? '' : String(s.name);
  const parts = rawName.split('|').map(x => x.trim());
  const weapon = parts[0] || rawName;
  const paint  = parts.slice(1).join(' | ') || '';
  return {
    id: s.id,
    name: rawName,
    weapon: weapon,
    paint: paint,
    image: rewriteToLocal(s.image, 'item'),
  };
}

function getCase(id) { return CASES.find(c => c.id === id); }
function getCasesByCategory(catKey) { return CASES.filter(c => c.category === catKey); }
