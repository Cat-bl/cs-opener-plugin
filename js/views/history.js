/* ========== 中奖记录视图 ========== */

const HistoryView = {
  render(root) {
    const history = Store.history();
    const stats = Store.stats();
    const totalOpened = stats.opened;

    // 最稀有掉落
    let rarest = null;
    for (const n of RARITY_NUMS_DESC) {
      const found = history.find(h => h.rarityNum === n);
      if (found) { rarest = found; break; }
    }

    root.innerHTML = `
      <div class="view-header">
        <div>
          <div class="view-title">开箱记录</div>
          <div class="view-subtitle">HISTORY · 最近 ${Math.min(history.length, 500)} 次开箱</div>
        </div>
      </div>

      <div class="hist-stats">
        <div class="hist-stat">
          <div class="hist-stat-label">总开箱次数</div>
          <div class="hist-stat-value">${totalOpened}</div>
          <div class="hist-stat-sub">投入金币 ¥${totalOpened * 17}</div>
        </div>
        <div class="hist-stat">
          <div class="hist-stat-label">品质分布</div>
          <div class="hist-stat-value" style="font-size:14px;">
            ${[3,4,5,6,7].map(n => {
              const got = stats.byNum[n] || 0;
              const pct = totalOpened > 0 ? (got / totalOpened * 100).toFixed(2) : '0.00';
              return `<span style="display:inline-block;margin-right:10px;color:${RARITY[n].color}" title="${RARITY[n].name}">${got} <span style="opacity:.6;font-size:10px;">(${pct}%)</span></span>`;
            }).join('')}
          </div>
          <div class="hist-rarity-bar">
            ${[3,4,5,6,7].map(n => {
              const got = stats.byNum[n] || 0;
              const pct = totalOpened > 0 ? (got / totalOpened * 100) : 0;
              return pct > 0 ? `<div style="width:${pct}%;background:${RARITY[n].color}"></div>` : '';
            }).join('')}
          </div>
        </div>
        <div class="hist-stat">
          <div class="hist-stat-label">最稀有掉落</div>
          ${rarest ? `
            <div class="hist-stat-value" style="color:${rarest.rarityColor};font-size:15px;">${rarest.paint || rarest.name}</div>
            <div class="hist-stat-sub">${rarest.weapon} · ${rarest.rarityName}</div>
          ` : `
            <div class="hist-stat-value" style="font-size:14px;color:var(--text-2);">暂无</div>
            <div class="hist-stat-sub">开几个箱子试试</div>
          `}
        </div>
      </div>

      ${history.length === 0 ? `
        <div class="hist-empty">还没有开箱记录</div>
      ` : `
        <div class="hist-list">
          <div class="hist-row head">
            <div>时间</div>
            <div>物品</div>
            <div>武器箱</div>
            <div>磨损</div>
            <div>StatTrak</div>
          </div>
          ${history.map(renderHistRow).join('')}
        </div>
      `}
    `;
  },
};

function renderHistRow(it) {
  const date = new Date(it.obtainedAt);
  const t = `${date.getMonth()+1}-${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  return `
    <div class="hist-row">
      <div class="hist-time">${t}</div>
      <div class="hist-name">
        <div class="hist-dot" style="background:${it.rarityColor}"></div>
        <span style="color:${it.rarityColor};font-weight:700;">${it.weapon}</span>
        <span style="color:#fff;">${it.paint ? '| ' + it.paint : ''}</span>
      </div>
      <div class="hist-case">${it.caseName || '-'}</div>
      <div class="hist-wear">${it.wear != null ? it.wearTier + ' · ' + it.wear.toFixed(3) : '<span class="dim">—</span>'}</div>
      <div>${it.isStatTrak ? '<span class="stattrakcolor">★ ST™</span>' : '<span class="dim">—</span>'}</div>
    </div>
  `;
}
