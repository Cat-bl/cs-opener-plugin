/* ========== Shop 视图（按类型分组的箱子列表） ========== */

const ShopView = {
  currentCat: 'weapon_case',

  render(root) {
    if (!CASES.length) {
      root.innerHTML = '<div class="boot-screen"><div class="boot-text">暂无可用盒子</div></div>';
      return;
    }
    this.root = root;
    this.draw();
  },

  draw() {
    const list = getCasesByCategory(this.currentCat);
    const meta = CATEGORY_BY_KEY[this.currentCat];

    this.root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">${meta.label}</div>
          <div class="view-subtitle">${list.length} 个 · 单次价格 ${meta.priceLabel}</div>
        </div>
        <div class="muted" style="font-size:12px;">全部共 ${CASES.length} 个盒子</div>
      </div>

      <div class="cat-tabs">
        ${CATEGORIES.map(c => {
          const count = getCasesByCategory(c.key).length;
          if (count === 0) return '';
          return `<button class="cat-tab ${c.key === this.currentCat ? 'active' : ''}" data-cat="${c.key}">
            ${c.label} <span class="cat-tab-num">${count}</span>
          </button>`;
        }).join('')}
      </div>

      <div class="case-grid">
        ${list.map(renderCard).join('')}
      </div>
    `;

    this.root.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentCat = btn.dataset.cat;
        SFX.btnHover();
        this.draw();
      });
    });
    this.root.querySelectorAll('[data-cid]').forEach(card => {
      card.addEventListener('mouseenter', () => SFX.hover());
      card.addEventListener('click', () => {
        SFX.btnHover();
        location.hash = `#/case/${card.dataset.cid}`;
      });
    });
  },
};

function renderCard(c) {
  const cheap = Store.coins() >= c.price;
  return `
    <div class="case-card" data-cid="${c.id}">
      <div class="case-img-wrap">
        <img src="${c.image}" alt="${c.name}" loading="lazy">
      </div>
      <div class="case-name">${escapeHtmlShop(c.name)}</div>
      <div class="case-meta">
        <span class="case-price">¥ ${c.price}</span>
        <span class="case-cta ${cheap ? '' : 'dim'}">
          ${cheap ? '开 启 →' : '金币不足'}
        </span>
      </div>
    </div>
  `;
}

function escapeHtmlShop(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
