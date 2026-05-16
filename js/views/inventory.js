/* ========== 库存视图 ========== */

const InventoryView = {
  filter: 'all',

  render(root) {
    this.root = root;
    this.draw();
  },

  draw() {
    const items = Store.inventory();
    const filtered = this.applyFilter(items);

    this.root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">我的库存</div>
          <div class="view-subtitle">INVENTORY · 共 ${items.length} 件物品</div>
        </div>
      </div>

      <div class="inv-filters">
        ${this.filterBtn('all', '全部', items.length)}
        ${RARITY_NUMS_DESC.map(n => this.filterBtn(
          'r' + n,
          `<span style="color:${RARITY[n].color}">●</span> ${RARITY[n].name}`,
          items.filter(i => i.rarityNum === n).length
        )).join('')}
        ${this.filterBtn('stattrak', '<span style="color:#cf6a32">★</span> StatTrak™',
          items.filter(i => i.isStatTrak).length)}
      </div>

      ${filtered.length === 0 ? `
        <div class="inv-empty">
          <div class="inv-empty-title">还没有物品</div>
          <div>去开几个箱子试试运气吧</div>
        </div>
      ` : `
        <div class="inv-grid">
          ${filtered.map(renderInvCard).join('')}
        </div>
      `}
    `;

    this.root.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.filter;
        SFX.btnHover();
        this.draw();
      });
    });

    this.root.querySelectorAll('[data-uid]').forEach(card => {
      card.addEventListener('click', () => {
        const item = Store.inventory().find(i => i.uid === card.dataset.uid);
        if (item) showDetail(item, () => this.draw());
      });
    });
  },

  filterBtn(key, label, count) {
    return `<button class="inv-filter ${this.filter === key ? 'active' : ''}" data-filter="${key}">
      ${label} <span style="opacity:.7;">(${count})</span>
    </button>`;
  },

  applyFilter(items) {
    if (this.filter === 'all') return items;
    if (this.filter === 'stattrak') return items.filter(i => i.isStatTrak);
    if (this.filter.startsWith('r')) {
      const n = parseInt(this.filter.slice(1), 10);
      return items.filter(i => i.rarityNum === n);
    }
    return items;
  },
};

function renderInvCard(it) {
  const errAttr = imgErrAttr(it.weapon, it.paint, it.rarityNum);
  const hasWear = it.wear != null;
  return `
    <div class="inv-card" data-uid="${it.uid}" style="--rc:${it.rarityColor};">
      ${it.isStatTrak ? '<div class="st-tag">ST™</div>' : ''}
      <div class="inv-img">
        <div class="color${it.rarityNum} bar inv-bar"></div>
        <img src="${it.image}" ${errAttr}>
      </div>
      <div class="inv-weapon">${it.weapon}</div>
      <div class="inv-name">${it.paint || '—'}</div>
      <div class="inv-meta">
        ${hasWear
          ? `<span class="inv-tier">${it.wearTier}</span><span>${it.wear.toFixed(3)}</span>`
          : `<span class="inv-tier">${it.rarityName}</span><span></span>`}
      </div>
    </div>
  `;
}

function showDetail(item, onChange) {
  const overlay = document.createElement('div');
  overlay.className = 'detail-overlay';
  const errAttr = imgErrAttr(item.weapon, item.paint, item.rarityNum);
  const sellPrice = sellPriceOf(item);
  const date = new Date(item.obtainedAt).toLocaleString('zh-CN');

  overlay.innerHTML = `
    <div class="detail-card" style="--rc:${item.rarityColor};border-color:${item.rarityColor};">
      <div class="reveal-banner" style="color:${item.rarityColor};">物品详情</div>
      <div class="detail-img">
        <img src="${item.image}" ${errAttr}>
      </div>
      <div class="reveal-weapon">${item.isStatTrak ? '<span class="stattrakcolor">StatTrak™</span> ' : ''}${item.weapon}</div>
      <div class="reveal-name">${item.paint || '原版'}</div>
      <div class="reveal-rarity" style="background:${item.rarityColor}33;border:1px solid ${item.rarityColor};">${item.rarityName}</div>
      ${item.wear != null ? `<div class="reveal-wear">
        磨损度 <strong>${item.wear.toFixed(13)}</strong><br>
        <strong>${item.wearTierName} (${item.wearTier})</strong>${item.pattern != null ? ` · 图案模板 <strong>${item.pattern}</strong>` : ''}
      </div>` : ''}
      <div class="reveal-wear muted" style="font-size:11px; margin-top:8px;">
        来自 <strong>${item.caseName || '?'}</strong> · ${date}
      </div>
      <div class="reveal-actions">
        <button class="btn primary" data-act="sell">
          出售 <span style="color:#16110a;">¥${sellPrice}</span>
        </button>
        <button class="btn" data-act="close">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('[data-act="close"]').addEventListener('click', () => {
    SFX.btnHover(); overlay.remove();
  });
  overlay.querySelector('[data-act="sell"]').addEventListener('click', () => {
    SFX.btnHover();
    Store.removeItem(item.uid);
    Store.earn(sellPrice);
    overlay.remove();
    onChange && onChange();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
