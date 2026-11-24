// 文字数カウントの純粋ロジック。
// content script / popup / options / node テストの全てから読めるよう、
// ES モジュールにせず globalThis.SimpleCount に登録する。
(() => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  const NEWLINES = new Set(["\r\n", "\n", "\r", "", " ", " "]);
  const SPACE_RE = /^\s$/u;
  // 半角換算で 0.5 文字扱いにする空白
  const HALF_SPACES = new Set([" ", "\t", "\v", "\f"]);

  const ANALYZE_DEFAULTS = {
    halfWidthAsHalf: false,
    excludeEnabled: false,
    excludedChars: "",
    includeSpaces: true,
    includeNewlines: true,
  };

  function toGraphemes(text) {
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }

  let cachedExcludedSource = null;
  let cachedExcludedSet = null;
  function excludedSet(chars) {
    if (chars !== cachedExcludedSource) {
      cachedExcludedSource = chars;
      cachedExcludedSet = new Set(toGraphemes(chars));
    }
    return cachedExcludedSet;
  }

  // 書記素を構成する全コードポイントが ASCII 表示文字 (U+0021–007E) か半角カナ (U+FF61–FF9F)
  function isHalfWidth(grapheme) {
    for (const ch of grapheme) {
      const c = ch.codePointAt(0);
      if (!((c >= 0x21 && c <= 0x7e) || (c >= 0xff61 && c <= 0xff9f))) return false;
    }
    return true;
  }

  function analyze(text, options) {
    const o = { ...ANALYZE_DEFAULTS, ...options };
    const exclude = o.excludeEnabled && o.excludedChars ? excludedSet(o.excludedChars) : null;

    let total = 0;
    let fullWidth = 0;
    let halfWidth = 0;
    let spaces = 0;
    let newlines = 0;
    let excluded = 0;
    let graphemes = 0;

    for (const { segment: g } of segmenter.segment(text)) {
      graphemes++;
      if (NEWLINES.has(g)) {
        newlines++;
        if (o.includeNewlines) total += 1;
      } else if (SPACE_RE.test(g)) {
        spaces++;
        if (o.includeSpaces) total += o.halfWidthAsHalf && HALF_SPACES.has(g) ? 0.5 : 1;
      } else if (exclude && exclude.has(g)) {
        excluded++;
      } else if (isHalfWidth(g)) {
        halfWidth++;
        total += o.halfWidthAsHalf ? 0.5 : 1;
      } else {
        fullWidth++;
        total += 1;
      }
    }

    return { total, fullWidth, halfWidth, spaces, newlines, excluded, graphemes };
  }

  // バッジ用。切り上げた整数を 4 文字以内に収める。
  function formatBadge(total) {
    const n = Math.ceil(total);
    if (!(n > 0)) return "";
    if (n <= 9999) return String(n);
    if (n < 1e6) return `${Math.floor(n / 1e3)}k`;
    if (n < 1e7) return `${Math.floor(n / 1e5) / 10}M`;
    return `${Math.min(999, Math.floor(n / 1e6))}M`;
  }

  // 詳細表示用。小数第 1 位まで、桁区切りつき。
  function formatDetail(total, locale) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(total);
  }

  globalThis.SimpleCount = { analyze, formatBadge, formatDetail, toGraphemes };
})();
