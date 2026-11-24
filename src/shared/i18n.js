// popup / options 用。data-i18n 属性の要素にメッセージを流し込む。
(() => {
  function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions);
  }

  function localize(root = document) {
    document.documentElement.lang = chrome.i18n.getUILanguage();
    for (const el of root.querySelectorAll("[data-i18n]")) {
      const msg = t(el.dataset.i18n);
      if (msg) el.textContent = msg;
    }
  }

  globalThis.SimpleCountI18n = { t, localize };
})();
