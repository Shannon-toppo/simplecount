// 設定のスキーマ・既定値・storage.sync 読み書き。
(() => {
  const KEY = "settings";

  const DEFAULTS = Object.freeze({
    halfWidthAsHalf: false,
    excludeEnabled: true,
    excludedChars: "、。，．､｡",
    includeSpaces: true,
    includeNewlines: false,
  });

  const TOGGLE_KEYS = ["halfWidthAsHalf", "excludeEnabled", "includeSpaces", "includeNewlines"];

  function normalize(value) {
    const out = { ...DEFAULTS };
    if (value && typeof value === "object") {
      for (const k of Object.keys(DEFAULTS)) {
        if (typeof value[k] === typeof DEFAULTS[k]) out[k] = value[k];
      }
    }
    return out;
  }

  async function load() {
    const stored = await chrome.storage.sync.get(KEY);
    return normalize(stored[KEY]);
  }

  // 連続クリックで load→set が交錯して変更が消えないよう直列化する
  let saving = Promise.resolve();
  function save(patch) {
    const task = saving.then(async () => {
      const next = normalize({ ...(await load()), ...patch });
      await chrome.storage.sync.set({ [KEY]: next });
      return next;
    });
    saving = task.catch(() => {});
    return task;
  }

  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes[KEY]) callback(normalize(changes[KEY].newValue));
    });
  }

  globalThis.SimpleCountSettings = { DEFAULTS, TOGGLE_KEYS, normalize, load, save, onChange };
})();
