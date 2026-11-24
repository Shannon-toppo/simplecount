const { toGraphemes } = globalThis.SimpleCount;
const Settings = globalThis.SimpleCountSettings;
const { t, localize } = globalThis.SimpleCountI18n;

const $ = (id) => document.getElementById(id);
const SAVE_DELAY_MS = 400;

let saveTimer = null;
let statusTimer = null;

function showStatus(message, isError = false) {
  const el = $("status");
  el.textContent = message;
  el.classList.toggle("error", isError);
  clearTimeout(statusTimer);
  if (!isError) statusTimer = setTimeout(() => (el.textContent = ""), 1500);
}

async function save(patch) {
  try {
    await Settings.save(patch);
    showStatus(t("optionsSaved"));
  } catch (err) {
    // storage.sync の容量上限 (1 項目 8KB) 超過など
    showStatus(`${t("optionsSaveError")}: ${err?.message ?? err}`, true);
  }
}

function renderExcludedCount(chars) {
  const distinct = new Set(toGraphemes(chars)).size;
  $("excludedCount").textContent = t("optionsExcludedCount", [String(distinct)]);
}

function render(settings) {
  for (const key of Settings.TOGGLE_KEYS) $(key).checked = settings[key];
  const input = $("excludedChars");
  // 入力中は外からの更新で上書きしない
  if (document.activeElement !== input) input.value = settings.excludedChars;
  renderExcludedCount(input.value);
}

async function init() {
  localize();
  render(await Settings.load());
  Settings.onChange(render);

  for (const key of Settings.TOGGLE_KEYS) {
    $(key).addEventListener("change", (e) => save({ [key]: e.target.checked }));
  }

  const input = $("excludedChars");
  input.addEventListener("input", () => {
    renderExcludedCount(input.value);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      save({ excludedChars: input.value });
    }, SAVE_DELAY_MS);
  });
  input.addEventListener("blur", () => {
    if (saveTimer === null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    save({ excludedChars: input.value });
  });

  $("reset").addEventListener("click", () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    input.value = Settings.DEFAULTS.excludedChars;
    renderExcludedCount(input.value);
    save({ excludedChars: input.value });
  });
}

init();
