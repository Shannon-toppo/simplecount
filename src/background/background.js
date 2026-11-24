// タブ/フレームごとの結果を保持してバッジを更新する。
// MV3 の service worker は止まるので、状態は storage.session に置く。

const BADGE_COLORS = {
  selection: "#4a6fa5",
  field: "#5a8f5a",
};

const stateKey = (tabId) => `tab:${tabId}`;

// 同じタブへの更新を直列化する (storage の読み書きが交錯しないように)
const queues = new Map();
function enqueue(tabId, task) {
  const next = (queues.get(tabId) ?? Promise.resolve()).then(task).catch((err) => {
    console.warn("[SimpleCount]", err);
  });
  queues.set(tabId, next);
  next.then(() => {
    if (queues.get(tabId) === next) queues.delete(tabId);
  });
}

async function applyBadge(tabId, state) {
  try {
    await chrome.action.setBadgeText({ tabId, text: state?.badge ?? "" });
    if (state) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[state.mode] });
      await chrome.action.setBadgeTextColor?.({ tabId, color: "#ffffff" });
    }
  } catch {
    // タブが既に閉じられている
  }
}

async function clearTab(tabId) {
  await chrome.storage.session.remove(stateKey(tabId));
  await applyBadge(tabId, null);
}

async function handleCount(tabId, frameId, message) {
  const key = stateKey(tabId);

  if (message.mode === "none") {
    const current = (await chrome.storage.session.get(key))[key];
    // 採用中のフレームの選択が消えたときだけクリアする
    if (current && current.frameId === frameId) await clearTab(tabId);
    return;
  }

  if (message.mode !== "selection" && message.mode !== "field") return;

  const state = {
    frameId,
    mode: message.mode,
    result: message.result,
    badge: message.badge,
    ts: Date.now(),
  };
  await chrome.storage.session.set({ [key]: state });
  await applyBadge(tabId, state);
}

// async 関数を直接渡すと Firefox が戻り値の Promise を応答として扱うので、同期関数で包む
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "count" || sender.tab?.id === undefined) return;
  const tabId = sender.tab.id;
  enqueue(tabId, () => handleCount(tabId, sender.frameId ?? 0, message));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") enqueue(tabId, () => clearTab(tabId));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  enqueue(tabId, () => chrome.storage.session.remove(stateKey(tabId)));
});
