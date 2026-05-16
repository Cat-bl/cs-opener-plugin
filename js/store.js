/* ========== 状态持久化 (localStorage) ========== */

const STORE_KEY = 'csgo_state_v2';
const INITIAL_COINS = 10000;

const Store = (() => {
  let state = load();

  function emptyStats() {
    return {
      opened: 0,
      byNum: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0 },
      statTrakByNum: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0 },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            coins: typeof parsed.coins === 'number' ? parsed.coins : INITIAL_COINS,
            inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
            history: Array.isArray(parsed.history) ? parsed.history : [],
            stats: mergeStats(parsed.stats),
          };
        }
      }
    } catch (e) { console.warn(e); }
    return { coins: INITIAL_COINS, inventory: [], history: [], stats: emptyStats() };
  }

  function mergeStats(s) {
    const blank = emptyStats();
    if (!s || typeof s !== 'object') return blank;
    return {
      opened: s.opened || 0,
      byNum: Object.assign({}, blank.byNum, s.byNum || {}),
      statTrakByNum: Object.assign({}, blank.statTrakByNum, s.statTrakByNum || {}),
    };
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    notify();
  }

  const subscribers = [];
  function subscribe(fn) { subscribers.push(fn); }
  function notify() { subscribers.forEach(fn => fn(state)); }

  return {
    get: () => state,
    coins: () => state.coins,
    inventory: () => state.inventory,
    history: () => state.history,
    stats: () => state.stats,

    spend(amount) {
      if (state.coins < amount) return false;
      state.coins -= amount;
      save();
      return true;
    },
    earn(amount) { state.coins += amount; save(); },
    addItem(item) { state.inventory.unshift(item); save(); },
    removeItem(uid) {
      state.inventory = state.inventory.filter(it => it.uid !== uid);
      save();
    },
    addHistory(item) {
      state.history.unshift(item);
      if (state.history.length > 500) state.history.length = 500;
      state.stats.opened += 1;
      const n = item.rarityNum;
      state.stats.byNum[n] = (state.stats.byNum[n] || 0) + 1;
      if (item.isStatTrak) {
        state.stats.statTrakByNum[n] = (state.stats.statTrakByNum[n] || 0) + 1;
      }
      save();
    },

    reset() {
      state = { coins: INITIAL_COINS, inventory: [], history: [], stats: emptyStats() };
      save();
    },

    subscribe,
  };
})();
