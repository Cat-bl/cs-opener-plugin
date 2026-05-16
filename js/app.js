/* ========== 入口：异步加载数据 + 路由 ========== */

const App = {
  root: null,

  async init() {
    this.root = document.getElementById('view');
    this.bindWallet();
    this.bindReset();
    window.addEventListener('hashchange', () => this.route());

    this.showLoading();
    try {
      await loadCases();
    } catch (err) {
      this.showError(err);
      return;
    }

    if (!location.hash) location.hash = '#/shop';
    else this.route();
  },

  showLoading() {
    this.root.innerHTML = `
      <div class="boot-screen">
        <div class="boot-logo">CS:GO</div>
        <div class="boot-spinner"></div>
        <div class="boot-text">正在从 ByMykel/CSGO-API 加载武器箱数据...</div>
      </div>
    `;
  },

  showError(err) {
    this.root.innerHTML = `
      <div class="boot-screen">
        <div class="boot-logo" style="color:#eb4b4b;">!</div>
        <div class="boot-text">数据加载失败：${err.message}<br><br>
          请检查网络后刷新页面。如果墙影响访问 GitHub Raw，
          可以使用代理或离线开发。
        </div>
      </div>
    `;
  },

  route() {
    const hash = location.hash || '#/shop';
    const parts = hash.replace(/^#\//, '').split('/');
    const view = parts[0] || 'shop';
    const param = parts[1];

    document.querySelectorAll('[data-nav]').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === view);
    });

    // case 路由下隐藏底栏，让 letterbox 真正延伸到屏幕底部
    document.body.classList.toggle('case-mode', view === 'case');

    this.root.innerHTML = '';
    this.root.classList.remove('fadein', 'shop-route', 'case-route');
    void this.root.offsetWidth;
    this.root.classList.add('fadein');

    switch (view) {
      case 'shop':      ShopView.render(this.root, param); break;
      case 'case':      CaseView.render(this.root, param); break;
      case 'inventory': InventoryView.render(this.root); break;
      case 'history':   HistoryView.render(this.root); break;
      case 'settings':  SettingsView.render(this.root); break;
      default:          ShopView.render(this.root);
    }
  },

  bindWallet() {
    const el = document.getElementById('coin-amount');
    const update = () => { el.textContent = Store.coins().toLocaleString(); };
    update();
    Store.subscribe(update);
  },

  bindReset() {
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('确定要重置所有存档？\n这会清空金币、库存和记录（不影响已缓存的武器箱数据）。')) {
        Store.reset();
        SFX.click();
        location.hash = '#/shop';
        this.route();
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
