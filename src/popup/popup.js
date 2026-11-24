const { formatDetail } = globalThis.SimpleCount;
const Settings = globalThis.SimpleCountSettings;
const { t, localize } = globalThis.SimpleCountI18n;

const $ = (id) => document.getElementById(id);
const BREAKDOWN_KEYS = ["fullWidth", "halfWidth", "spaces", "newlines", "excluded"];
const MODE_LABELS = { selection: "popupModeSelection", field: "popupModeField" };

function render(state) {
  const mode = state?.mode in MODE_LABELS ? state.mode : "none";
  const result = mode === "none" ? null : state.result;

  document.body.dataset.mode = mode;
  $("mode").textContent = t(MODE_LABELS[mode] ?? "popupModeNone");
  $("total").textContent = formatDetail(result?.total ?? 0);
  for (const key of BREAKDOWN_KEYS) {
    $(key).textContent = formatDetail(result?.[key] ?? 0);
  }
}

function renderToggles(settings) {
  for (const key of Settings.TOGGLE_KEYS) $(key).checked = settings[key];
}

async function hasContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "ping" });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function init() {
  localize();

  renderToggles(await Settings.load());
  for (const key of Settings.TOGGLE_KEYS) {
    $(key).addEventListener("change", (e) => Settings.save({ [key]: e.target.checked }));
  }
  Settings.onChange(renderToggles);

  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });

  render(null);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !(await hasContentScript(tab.id))) {
    $("count").hidden = true;
    $("unsupported").hidden = false;
    return;
  }

  const key = `tab:${tab.id}`;
  render((await chrome.storage.session.get(key))[key]);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && key in changes) render(changes[key].newValue);
  });
}

init();
