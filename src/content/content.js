// 選択テキストを検出して数え、結果を background に送る。全フレームで動く。
(() => {
  const { analyze, formatBadge } = globalThis.SimpleCount;
  const Settings = globalThis.SimpleCountSettings;

  const THROTTLE_MS = 100;
  const LARGE_THRESHOLD = 100_000;
  const LARGE_DEBOUNCE_MS = 150;

  // selectionStart/End が使える input の type
  const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", ""]);

  let settings = Settings.DEFAULTS;
  let timer = null;
  let lastRun = 0;
  let lastLength = 0;
  let lastMode = "none";
  let lastText = "";
  let lastSentKey = "none|";
  let alive = true;

  function deepActiveElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function isTextField(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    return el.tagName === "INPUT" && TEXT_INPUT_TYPES.has(el.getAttribute("type")?.toLowerCase() ?? "");
  }

  function readSelection() {
    const el = deepActiveElement();
    if (isTextField(el)) {
      const { selectionStart: start, selectionEnd: end, value } = el;
      if (start !== null && end !== null && start !== end) {
        return { mode: "selection", text: value.slice(start, end) };
      }
      return { mode: "field", text: value };
    }
    const text = document.getSelection()?.toString() ?? "";
    return text ? { mode: "selection", text } : { mode: "none", text: "" };
  }

  function send(message) {
    if (!chrome.runtime?.id) {
      // 拡張の再読み込みなどでコンテキストが無効になった
      teardown();
      return;
    }
    chrome.runtime.sendMessage(message)?.catch?.(() => {});
  }

  function run() {
    clearTimeout(timer);
    timer = null;
    lastRun = performance.now();

    const { mode, text } = readSelection();
    lastLength = text.length;
    if (mode === lastMode && text === lastText) return;
    lastMode = mode;
    lastText = text;

    if (mode === "none") {
      if (lastSentKey === "none|") return;
      lastSentKey = "none|";
      send({ type: "count", mode });
      return;
    }

    const result = analyze(text, settings);
    const badge = formatBadge(result.total);
    const key = `${mode}|${JSON.stringify(result)}`;
    if (key === lastSentKey) return;
    lastSentKey = key;
    send({ type: "count", mode, result, badge });
  }

  // 通常は leading + trailing の throttle。直前の選択が巨大なら止まってから 1 回だけ数える。
  function schedule() {
    if (!alive) return;
    if (lastLength > LARGE_THRESHOLD) {
      clearTimeout(timer);
      timer = setTimeout(run, LARGE_DEBOUNCE_MS);
      return;
    }
    const wait = THROTTLE_MS - (performance.now() - lastRun);
    if (wait <= 0) run();
    else if (timer === null) timer = setTimeout(run, wait);
  }

  // 設定変更などで強制的に数え直す。未選択のままなら "none" を再送しない
  // (ページ読み込みのたびに全フレームが service worker を起こさないように)。
  function recount() {
    lastMode = null;
    lastText = null;
    if (lastSentKey !== "none|") lastSentKey = null;
    schedule();
  }

  function onPageHide() {
    lastMode = "none";
    lastText = "";
    lastSentKey = "none|";
    send({ type: "count", mode: "none" });
  }

  function onPageShow(e) {
    if (e.persisted) recount();
  }

  function onMessage(message, _sender, sendResponse) {
    if (message?.type === "ping") sendResponse({ ok: true });
  }

  // input/textarea 内の選択で selectionchange が来ない環境向けに select/keyup/mouseup も拾う。
  // 重複は schedule の間引きと run の差分チェックで吸収する。
  const DOC_EVENTS = ["selectionchange", "select", "input", "keyup", "mouseup", "focusin", "focusout"];

  function teardown() {
    alive = false;
    clearTimeout(timer);
    for (const type of DOC_EVENTS) document.removeEventListener(type, schedule, true);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  }

  for (const type of DOC_EVENTS) document.addEventListener(type, schedule, true);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  chrome.runtime.onMessage.addListener(onMessage);

  Settings.onChange((next) => {
    settings = next;
    recount();
  });
  Settings.load().then((loaded) => {
    settings = loaded;
    recount();
  });
})();
