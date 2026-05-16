/* ========== 设置视图（调整开箱概率） ========== */

const SettingsView = {
  render(root) {
    const odds = getOdds();

    root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">开箱设置</div>
          <div class="view-subtitle">SETTINGS · 调整各品质掉落概率（万分比，总和需为 100000）</div>
        </div>
        <div class="muted" style="font-size:12px;">实时生效 · 保存到本地</div>
      </div>

      <div class="settings-panel">
        <div class="settings-help">
          下方为 <b>标准武器箱</b> 的官方默认概率。修改后立即生效，关闭浏览器后仍保留。
        </div>

        <div id="odds-list">
          ${[3,4,5,6,7].map(num => renderRow(num, odds[num])).join('')}
        </div>

        <div class="odds-totals">
          <div>当前总和：<b id="odds-total">${sum(odds)}</b> / 100000
            <span id="odds-total-status"></span>
          </div>
          <div class="muted" style="font-size:11px;margin-top:4px;">
            可以不等于 100000，系统会按比例归一化抽取。
          </div>
        </div>

        <div class="settings-actions">
          <button class="btn primary" id="odds-save">保存</button>
          <button class="btn" id="odds-reset">恢复默认</button>
          <button class="btn" id="odds-normalize">归一化到 100000</button>
        </div>

        <div class="settings-presets">
          <div class="muted" style="font-size:11px;letter-spacing:2px;margin-bottom:8px;">快捷预设</div>
          <button class="btn preset-btn" data-preset="default">官方真实</button>
          <button class="btn preset-btn" data-preset="lucky">非洲酋长（金 10%）</button>
          <button class="btn preset-btn" data-preset="god">欧皇模式（金 50%）</button>
          <button class="btn preset-btn" data-preset="balanced">均匀分布</button>
          <button class="btn preset-btn" data-preset="cruel">残酷现实（金 0.01%）</button>
        </div>

        <div class="settings-divider"></div>

        <div class="muted" style="font-size:12px; letter-spacing:1px;">关于概率</div>
        <div style="font-size:12px; line-height:1.8; margin-top:6px;">
          官方武器箱使用 <b>1:5</b> 的递减比例：军规级（蓝） ≈ 79.92%、受限（紫） ≈ 15.98%、保密（粉） ≈ 3.20%、隐秘（红） ≈ 0.64%、罕见特殊（金/匕首/手套） ≈ 0.26%。<br>
          StatTrak™ 概率固定 10%（不可调整）。
        </div>
      </div>
    `;

    // 监听输入实时更新总和
    root.querySelectorAll('input[type="number"]').forEach(inp => {
      inp.addEventListener('input', () => this.refreshTotal());
    });

    // 保存
    root.querySelector('#odds-save').addEventListener('click', () => {
      const data = this.collect();
      setOdds(data);
      SFX.btnHover();
      flash('已保存');
    });

    // 重置
    root.querySelector('#odds-reset').addEventListener('click', () => {
      if (!confirm('恢复为官方默认概率？')) return;
      resetOdds();
      SFX.btnHover();
      this.render(root);
    });

    // 归一化
    root.querySelector('#odds-normalize').addEventListener('click', () => {
      const cur = this.collect();
      const total = sum(cur);
      if (total <= 0) return;
      const next = {};
      [3,4,5,6,7].forEach(n => { next[n] = Math.round(cur[n] / total * 100000); });
      // 修正零头
      const diff = 100000 - sum(next);
      next[3] += diff;
      setOdds(next);
      SFX.btnHover();
      this.render(root);
    });

    // 预设
    root.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.preset;
        const preset = PRESETS[name];
        if (!preset) return;
        setOdds(preset);
        SFX.btnHover();
        this.render(root);
      });
    });

    this.refreshTotal();
  },

  collect() {
    const r = {};
    [3,4,5,6,7].forEach(n => {
      const inp = document.getElementById('odds-' + n);
      r[n] = Math.max(0, parseInt(inp.value, 10) || 0);
    });
    return r;
  },

  refreshTotal() {
    const cur = this.collect();
    const total = sum(cur);
    const totalEl = document.getElementById('odds-total');
    const statusEl = document.getElementById('odds-total-status');
    if (totalEl) totalEl.textContent = total.toLocaleString();
    if (statusEl) {
      if (total === 100000) {
        statusEl.innerHTML = ' <span style="color:#7ec97e;">✓ 完全匹配</span>';
      } else if (total === 0) {
        statusEl.innerHTML = ' <span style="color:#eb4b4b;">✗ 不能全为 0</span>';
      } else {
        statusEl.innerHTML = ` <span style="color:var(--text-2);">(将按比例归一化)</span>`;
      }
    }
    // 实时更新每行百分比
    [3,4,5,6,7].forEach(n => {
      const pctEl = document.getElementById('odds-pct-' + n);
      if (pctEl) {
        const pct = total > 0 ? (cur[n] / total * 100) : 0;
        pctEl.textContent = pct.toFixed(3) + '%';
      }
    });
  },
};

function renderRow(num, value) {
  const r = RARITY[num];
  return `
    <div class="odds-row">
      <div class="odds-color" style="background:${r.color};"></div>
      <div class="odds-name">${r.name}</div>
      <input id="odds-${num}" type="number" min="0" max="100000" step="1" value="${value}">
      <div class="odds-pct" id="odds-pct-${num}">—</div>
      <div class="odds-default muted">默认 ${DEFAULT_ODDS[num]}</div>
    </div>
  `;
}

function sum(o) { return (o[3]||0)+(o[4]||0)+(o[5]||0)+(o[6]||0)+(o[7]||0); }

function flash(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1500);
}

/* 预设 */
const PRESETS = {
  default:  { 3: 79920, 4: 15980, 5: 3200,  6: 640,   7: 260 },
  lucky:    { 3: 50000, 4: 25000, 5: 10000, 6: 5000,  7: 10000 },
  god:      { 3: 20000, 4: 15000, 5: 10000, 6: 5000,  7: 50000 },
  balanced: { 3: 20000, 4: 20000, 5: 20000, 6: 20000, 7: 20000 },
  cruel:    { 3: 89999, 4: 9000,  5: 900,   6: 100,   7: 1 },
};
