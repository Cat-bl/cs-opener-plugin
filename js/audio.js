/* ========== 真实 CSGO 开箱音效（HTMLAudio + iOS 手势解锁） ==========
 * 之前用 Web Audio API + fetch 在 file:// 协议下被 Chrome 拒绝（CORS），
 * 改回 HTMLAudio（file:// 下可加载）+ 首次用户手势内对每个 <audio>
 * 调 play()/pause() 完成 iOS 自动播放白名单解锁，后续任何时机
 * 包括 setTimeout 6s 后的中奖音都能正常播放。
 */

const AUDIO_BASE = 'assets/audio';

const AUDIO_SRC = {
  kx_case:    `${AUDIO_BASE}/kaixiang_case.m4a`,     // 武器箱开箱滚动主音
  kx:         `${AUDIO_BASE}/kaixiang.m4a`,          // 通用开箱滚动主音（备用）
  drop:       `${AUDIO_BASE}/case_drop_01.mp3`,      // 加载/进入开箱时的"咔哒"声
  award0:     `${AUDIO_BASE}/case_awarded_0.mp3`,    // 消费级 / 工业级
  award1:     `${AUDIO_BASE}/case_awarded_1.mp3`,    // 军规级
  award2:     `${AUDIO_BASE}/case_awarded_2.mp3`,    // 受限
  award3:     `${AUDIO_BASE}/case_awarded_3.mp3`,    // 保密
  award4:     `${AUDIO_BASE}/case_awarded_4.mp3`,    // 隐秘
  award5:     `${AUDIO_BASE}/case_awarded_5.mp3`,    // 罕见特殊（金）
  hover:      `${AUDIO_BASE}/hover.m4a`,             // 物品 hover
  btnhover:   `${AUDIO_BASE}/btnhover.m4a`,          // 按钮 hover
};

const SFX = (() => {
  const pool = {};
  let unlocked = false;

  function ensure(key) {
    if (!pool[key]) {
      const el = new Audio(AUDIO_SRC[key]);
      el.preload = 'auto';
      pool[key] = el;
    }
    return pool[key];
  }

  /* 用户手势内调用：对每个 audio 元素做一次 muted play() → pause() 完成
   * iOS / Safari / 微信 WebView 的自动播放白名单解锁。
   * 同步连续调用是关键：所有 play() 必须在同一个用户手势事件循环里发起。 */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.keys(AUDIO_SRC).forEach(k => {
      const el = ensure(k);
      try {
        el.muted = true;
        const p = el.play();
        const restore = () => {
          try { el.pause(); el.currentTime = 0; el.muted = false; } catch (e) {}
        };
        if (p && p.then) p.then(restore).catch(() => { el.muted = false; });
        else restore();
      } catch (e) { /* ignore */ }
    });
  }

  function _play(key, volume) {
    try {
      const el = ensure(key);
      el.currentTime = 0;
      el.muted = false;
      if (volume != null) el.volume = volume;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  function spinStart() { _play('kx_case', 1.0); }

  function spinFade() {
    const el = pool.kx_case;
    if (!el) return;
    const step = setInterval(() => {
      if (!el || el.volume <= 0.02) {
        clearInterval(step);
        try { el.pause(); el.currentTime = 0; el.volume = 1; } catch (e) {}
        return;
      }
      el.volume = Math.max(0, el.volume - 0.05);
    }, 30);
  }

  function spinStop() {
    const el = pool.kx_case;
    if (!el) return;
    try { el.pause(); el.currentTime = 0; el.volume = 1; } catch (e) {}
  }

  const WIN_MAP = { 1: 'award0', 2: 'award0', 3: 'award1', 4: 'award2', 5: 'award3', 6: 'award4', 7: 'award5' };
  function win(rarityNum) { _play(WIN_MAP[rarityNum] || 'award1', 1.0); }

  function drop()     { _play('drop', 0.6); }
  function hover()    { _play('hover', 0.2); }
  function btnHover() { _play('btnhover', 0.3); }
  function click()    { _play('btnhover', 0.3); }

  return { unlock, preload: unlock, spinStart, spinFade, spinStop, win, drop, hover, btnHover, click };
})();

/* 首次用户交互（点击 + 触摸）解锁，捕获阶段 + once */
['click', 'touchstart'].forEach(ev => {
  window.addEventListener(ev, function once() {
    SFX.unlock();
  }, { once: true, passive: true, capture: true });
});
