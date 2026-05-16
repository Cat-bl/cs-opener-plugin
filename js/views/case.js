/* ========== Case 页（完整开箱体验） ========== */

const SPIN_DURATION   = 6000;                              // 6s
const SPIN_EASING     = 'cubic-bezier(.39,.58,.57,1)';
const TOTAL_ITEMS     = 30;
const WINNER_INDEX    = 26;
const AWARD_AT_MS     = 6000;                              // 中奖音播放时刻（与动画结束几乎同步）

/* 滚动条单元尺寸：直接读 DOM 第一个 li 的实际渲染尺寸（最准确，兼容 calc/clamp 等动态值） */
function readSpinDims() {
  const li = document.querySelector('#case-ani li');
  if (li) {
    const cs = getComputedStyle(li);
    const w  = parseFloat(cs.width)       || 567;
    const m  = parseFloat(cs.marginRight) || 0;
    if (w > 0) return { w, m, stride: w + m };
  }
  /* Fallback：尝试从 CSS 变量读（兼容老浏览器） */
  const rs = getComputedStyle(document.documentElement);
  const w  = parseFloat(rs.getPropertyValue('--spin-item-w'))      || 567;
  const m  = parseFloat(rs.getPropertyValue('--spin-item-margin')) || 40;
  return { w, m, stride: w + m };
}

/* CS 地图背景图池（本地） */
const CS_BG_LIST = [
  'ancient_0', 'anubis_0', 'baggage_0', 'dust2_0', 'inferno_0',
  'mission_0', 'nuke_0', 'office_0', 'overpass_0', 'warehouse_0',
];
function randomBgUrl() {
  const name = CS_BG_LIST[Math.floor(Math.random() * CS_BG_LIST.length)];
  return `assets/bg/${name}.jpg`;
}

/* 根据武器箱名挑选金色占位图：
 * - 画廊武器箱       (Gallery)     → gold2.jpg  廓尔喀刀图标
 * - 狂牙大行动武器箱 (Broken Fang) → gold1.jpg  特殊刀图标
 * - 其他            → gold.jpg   通用金月桂 ? 号
 */
function pickGoldImage(caseObj) {
  const n = (caseObj && caseObj.name) || '';
  if (n.includes('画廊')) return 'assets/img/gold2.jpg';
  if (n.includes('狂牙')) return 'assets/img/gold1.jpg';
  return 'assets/img/gold.jpg';
}

const CaseView = {
  caseObj: null,
  spinning: false,
  drop: null,
  bgUrl: null,

  render(root, caseId) {
    const c = getCase(caseId);
    if (!c) { location.hash = '#/shop'; return; }
    this.caseObj = c;
    this.spinning = false;
    this.drop = null;
    this.bgUrl = randomBgUrl();

    root.classList.add('case-route');
    root.innerHTML = `
      <div class="cs-bg" style="background-image:url('${this.bgUrl}')"></div>

      <div class="case-page">
        <!-- 静态信息面板 -->
        <div id="case-info-pane">
          <h1 class="case-title-h1">${c.categoryLabel === '武器箱' ? '开箱' : escapeHtml(c.categoryLabel)}</h1>
          <p class="unlock-text">解锁 <b>${escapeHtml(c.name)}</b></p>
          <div class="case-img-div">
            <img src="${c.image}" alt="${escapeHtml(c.name)}">
          </div>

          <div id="case-d">
            <p>这个箱子里可能有以下物品：</p>
            <hr>
            <ol>${renderDropList(c)}</ol>
          </div>
        </div>

        <!-- 开箱滚动动画面板 -->
        <div id="case-anim-pane">
          <div class="lb-mask top"></div>
          <div class="lb-mask bottom"></div>
          <div class="xian"></div>
          <div id="case-ani" class="ani"></div>
        </div>

        <!-- 中奖弹层 -->
        <div id="case-reveal">
          <div class="reveal-inner">
            <div class="reveal-skinname" id="rv-name"></div>
            <div class="reveal-image-wrap" id="rv-img-wrap">
              <img id="rv-img" src="" alt="">
            </div>
          </div>
          <div class="reveal-info" id="rv-info"></div>
          <div class="reveal-hint">点击任意处继续</div>
        </div>

        <!-- 右下绿色"开箱"按钮 -->
        <div id="open-fab" ${Store.coins() < c.price ? 'class="disabled"' : ''}>开箱</div>
      </div>
    `;

    // 进入页面时短促音
    setTimeout(() => SFX.drop(), 50);

    document.getElementById('open-fab').addEventListener('click', () => this.startOpen());
    document.getElementById('case-reveal').addEventListener('click', () => this.closeReveal());

    // 物品 hover 音
    root.querySelectorAll('#case-d ol li').forEach(li => {
      li.addEventListener('mouseenter', () => SFX.hover());
    });
  },

  startOpen() {
    if (this.spinning) return;
    if (Store.coins() < this.caseObj.price) return;
    SFX.unlock();  // 保险：点击 fab 是用户手势，确保移动端 AudioContext 已 resume
    this.spinning = true;
    Store.spend(this.caseObj.price);
    SFX.btnHover();

    // 决定本次掉落
    const drop = rollDrop(this.caseObj);
    this.drop = drop;

    // 构建滚动条（预生成 DOM，但保持初始位置在右侧外）
    this.fillAniTrack(drop);
    const track = document.getElementById('case-ani');
    track.style.transition = 'none';
    track.style.transform  = 'translate3d(2000px, 0, 0)';

    // 步骤1：信息面板下滑淡出（0.6s），按钮按下反馈
    const infoPane = document.getElementById('case-info-pane');
    const fab = document.getElementById('open-fab');
    infoPane.classList.add('dropping');
    fab.classList.add('firing');

    // 同时显示滚动面板（自带 fade-in）但暂不启动滚动
    document.getElementById('case-anim-pane').classList.add('show');

    // 步骤2：等过渡完成（350ms），启动滚动动画
    setTimeout(() => {
      infoPane.style.display = 'none';
      fab.style.display = 'none';

      // 实时读取当前断点下的单元尺寸（CSS 变量驱动）
      const dims = readSpinDims();
      // 计算最终位移：让 WINNER_INDEX 物品中心对齐屏幕中心
      const viewportCenter = window.innerWidth / 2;
      const winnerCenter = WINNER_INDEX * dims.stride + dims.w / 2;
      // 指针偏移上限：物品半宽的 65%，永远落在物品有效区域内、不会到空隙
      const jitter = (Math.random() - 0.5) * (dims.w * 0.65);
      const targetX = -(winnerCenter - viewportCenter + jitter);

      void track.offsetWidth;
      track.style.transition = `transform ${SPIN_DURATION}ms ${SPIN_EASING}`;
      track.style.transform  = `translate3d(${targetX}px, 0, 0)`;

      SFX.spinStart();
      setTimeout(() => SFX.win(drop.rarityNum), AWARD_AT_MS);
      setTimeout(() => this.showReveal(drop), SPIN_DURATION + 50);
    }, 350);
  },

  fillAniTrack(winnerDrop) {
    const track = document.getElementById('case-ani');
    const goldImg = pickGoldImage(this.caseObj);
    const caseObj = this.caseObj;
    const items = [];
    for (let i = 0; i < TOTAL_ITEMS; i++) {
      if (i === WINNER_INDEX) {
        // 中奖位：若是金色，滚动条上仍显示金球占位（神秘感）
        const isGold = winnerDrop.rarityNum === 7;
        items.push({
          name: winnerDrop.name, weapon: winnerDrop.weapon,
          paint: winnerDrop.paint,
          image: isGold ? goldImg : winnerDrop.image,
          rarityNum: winnerDrop.rarityNum,
        });
      } else {
        // 滚动条非中奖位封顶 + 默认几何概率（不受用户设置干扰）
        const num = rollRarityNumForCase(caseObj, true);
        const pool = caseObj.skinsByNum[num];
        let arr = pool;
        if (!arr || !arr.length) {
          for (let j = num - 1; j >= 1; j--) {
            if (caseObj.skinsByNum[j] && caseObj.skinsByNum[j].length) {
              arr = caseObj.skinsByNum[j]; break;
            }
          }
        }
        if (!arr || !arr.length) {
          for (let j = num + 1; j <= 6; j++) {
            if (caseObj.skinsByNum[j] && caseObj.skinsByNum[j].length) {
              arr = caseObj.skinsByNum[j]; break;
            }
          }
        }
        if (!arr || !arr.length) { i--; continue; }
        const s = arr[Math.floor(Math.random() * arr.length)];
        items.push({
          name: s.name, weapon: s.weapon, paint: s.paint,
          image: s.image, rarityNum: num,
        });
      }
    }
    track.innerHTML = items.map(renderAniCell).join('');
  },

  showReveal(drop) {
    // 保存到库存 + 历史
    Store.addItem(drop);
    Store.addHistory(drop);

    // 停止滚动音
    SFX.spinFade();

    const reveal = document.getElementById('case-reveal');
    const color  = RARITY[drop.rarityNum].color;
    const name = document.getElementById('rv-name');
    name.innerHTML = `
      <span>${escapeHtml(drop.weapon)}${drop.paint ? ' | ' + escapeHtml(drop.paint) : ''}${drop.isStatTrak ? ' <span class="stattrakcolor">(StatTrak™)</span>' : ''}</span>
      <span class="underline" style="background:${color}"></span>
    `;

    const errAttr = imgErrAttr(drop.weapon, drop.paint, drop.rarityNum);
    const imgEl = document.getElementById('rv-img');
    imgEl.outerHTML = `<img id="rv-img" src="${drop.image}" alt="" ${errAttr}>`;
    // 金色品质 → 整个 reveal 层加 .gold，让光晕铺满全屏
    reveal.classList.toggle('gold', drop.rarityNum === 7);

    document.getElementById('rv-info').innerHTML = renderRevealInfo(drop);
    reveal.classList.add('show');

    // 隐藏指针线和滚动条（用 class 覆盖 CSS animation 终态）
    document.getElementById('case-anim-pane').classList.add('revealing');
  },

  closeReveal() {
    if (!this.drop) return;
    SFX.btnHover();
    const reveal = document.getElementById('case-reveal');
    reveal.classList.remove('show', 'gold');
    const animPane = document.getElementById('case-anim-pane');
    animPane.classList.remove('show', 'revealing');

    const infoPane = document.getElementById('case-info-pane');
    const fab = document.getElementById('open-fab');
    infoPane.classList.remove('dropping');
    fab.classList.remove('firing');
    infoPane.style.display = '';
    fab.style.display = '';
    fab.classList.toggle('disabled', Store.coins() < this.caseObj.price);

    this.spinning = false;
    this.drop = null;
  },
};

/* 单个滚动单元（顶部黄线穿过的大图） */
function renderAniCell(item) {
  const errAttr = imgErrAttr(item.weapon, item.paint, item.rarityNum);
  const isGold = item.rarityNum === 7;
  return `
    <li>
      <div class="item-a${isGold ? ' gold-cell' : ''}">
        <div class="color${item.rarityNum} bar"></div>
        <img src="${item.image}" ${errAttr}>
      </div>
    </li>
  `;
}

/* 物品列表（页面底部） */
function renderDropList(c) {
  const items = [];
  for (const num of RARITY_NUMS_ASC) {
    const list = c.skinsByNum[num] || [];
    for (const s of list) items.push({ ...s, rarityNum: num });
  }
  // 罕见特殊单独一张汇总卡（不展开）
  const rareCount = (c.skinsByNum[7] || []).length;

  const cells = items
    .filter(s => s.rarityNum !== 7)
    .map(s => `
      <li>
        <div class="item-a">
          <div class="color${s.rarityNum} bar"></div>
          <img src="${s.image}" ${imgErrAttr(s.weapon, s.paint, s.rarityNum)}>
        </div>
        <div class="media-body">
          <b>${escapeHtml(s.weapon)}</b>
          <p>${escapeHtml(s.paint || '原版')}</p>
        </div>
      </li>
    `);

  if (rareCount > 0 && c.hasRare) {
    cells.push(`
      <li>
        <div class="item-a gold-cell">
          <div class="color7 bar"></div>
          <img src="${pickGoldImage(c)}">
        </div>
        <div class="media-body">
          <b style="color:rgb(255,215,0);">★ 罕见特殊物品</b>
          <p>${rareCount} 种刀/手套</p>
        </div>
      </li>
    `);
  }

  return cells.join('');
}

/* 中奖弹层左下信息（按盒子类型决定显示哪些字段） */
function renderRevealInfo(drop) {
  const stats = Store.stats();
  const total = stats.opened || 1;
  const byNum = stats.byNum || {};
  const stByNum = stats.statTrakByNum || {};
  const caseObj = getCase(drop.caseId);

  // 仅显示该箱实际有的档（避免印花包还展示"罕见特殊 0/0/0%"）
  const tierList = caseObj ? caseObj.presentTiers : [3,4,5,6,7];
  const showSt = caseObj ? caseObj.hasStatTrak : true;

  const tags = tierList.map(n => {
    const got = byNum[n] || 0;
    const st  = stByNum[n] || 0;
    const pct = (got / total * 100).toFixed(2);
    const stPart = showSt ? `<span class='stattrakcolor'>${st}</span>/` : '';
    return `<span class='color${n}-font font'>${RARITY[n].name}:(${got}/${stPart}${pct}%)</span>`;
  }).join('\n');

  const lines = [];
  if (drop.wear != null) lines.push(`磨损: ${drop.wear.toFixed(13)}`);
  if (drop.pattern != null) lines.push(`图案模板: ${drop.pattern}`);
  lines.push(`已开 ${total} 箱`);

  return `${lines.join('<br>')}<br>${tags}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
