import { test } from "node:test";
import assert from "node:assert/strict";
import "../src/shared/count.js";

const { analyze, formatBadge, formatDetail } = globalThis.SimpleCount;

// src/shared/settings.js の既定値と揃える
const DEFAULTS = {
  halfWidthAsHalf: false,
  excludeEnabled: true,
  excludedChars: "、。，．､｡",
  includeSpaces: true,
  includeNewlines: false,
};
const count = (text, overrides = {}) => analyze(text, { ...DEFAULTS, ...overrides });

test("書記素単位で数える", () => {
  assert.equal(count("👨‍👩‍👧").total, 1);
  assert.equal(count("🇯🇵").total, 1);
  assert.equal(count("が").total, 1, "結合用濁点は 1 文字");
  assert.equal(count("か゛").total, 2, "非結合の濁点記号 U+309B は別の文字");
});

test("空文字", () => {
  const r = count("");
  assert.equal(r.total, 0);
  assert.equal(r.graphemes, 0);
  assert.equal(formatBadge(r.total), "");
});

test("半角換算", () => {
  assert.equal(count("abc", { halfWidthAsHalf: true }).total, 1.5);
  assert.equal(count("abc").total, 3);
  assert.equal(count("Hello, world!", { halfWidthAsHalf: true }).total, 6.5);
  assert.equal(count("ＡＢＣ", { halfWidthAsHalf: true }).total, 3, "全角英数は 1 文字のまま");
  assert.equal(count("ｱｲｳ", { halfWidthAsHalf: true }).total, 1.5, "半角カナも 0.5");
  assert.equal(count("　", { halfWidthAsHalf: true }).total, 1, "全角スペースは 1");
  assert.equal(count("a\tb", { halfWidthAsHalf: true }).total, 1.5, "タブは半角空白扱い");
});

test("半角カナ + 半角濁点は 1 書記素として 0.5", () => {
  const r = count("ｶﾞ", { halfWidthAsHalf: true });
  assert.equal(r.total, 0.5);
  assert.equal(r.halfWidth, 1);
});

test("除外文字", () => {
  const r = count("こんにちは、世界。");
  assert.equal(r.total, 7);
  assert.equal(r.excluded, 2);
  assert.equal(count("こんにちは、世界。", { excludeEnabled: false }).total, 9);
  assert.equal(count("こんにちは、世界。", { excludedChars: "" }).total, 9);
  assert.equal(count("ﾃｽﾄ､ﾃｽﾄ｡", { halfWidthAsHalf: true }).total, 3, "半角句読点は除外が優先");
  assert.equal(count("👨‍👩‍👧👍", { excludedChars: "👨‍👩‍👧" }).total, 1, "書記素単位で除外");
});

test("空白と改行のスイッチ", () => {
  const text = "a b\nc";
  assert.equal(count(text, { includeSpaces: true, includeNewlines: false }).total, 4);
  assert.equal(count(text, { includeSpaces: true, includeNewlines: true }).total, 5);
  assert.equal(count(text, { includeSpaces: false, includeNewlines: false }).total, 3);
  assert.equal(count(text, { includeSpaces: false, includeNewlines: true }).total, 4);

  const r = count("a\r\nb\rc\nd", { includeNewlines: true });
  assert.equal(r.newlines, 3, "\\r\\n は 1 改行");
  assert.equal(r.total, 7);
});

test("内訳の合計は書記素数に一致する", () => {
  const r = count("Hello 世界、\nｶﾞ👍　。", { halfWidthAsHalf: true });
  assert.equal(r.fullWidth + r.halfWidth + r.spaces + r.newlines + r.excluded, r.graphemes);
  assert.deepEqual(
    { full: r.fullWidth, half: r.halfWidth, sp: r.spaces, nl: r.newlines, ex: r.excluded },
    { full: 3, half: 6, sp: 2, nl: 1, ex: 2 },
  );
});

test("バッジ整形", () => {
  const cases = [
    [0, ""],
    [0.5, "1"],
    [1.5, "2"],
    [9999, "9999"],
    [9999.5, "10k"],
    [10000, "10k"],
    [12345, "12k"],
    [999999, "999k"],
    [999999.5, "1M"],
    [1000000, "1M"],
    [1234567, "1.2M"],
    [9999999, "9.9M"],
    [12345678, "12M"],
    [5e9, "999M"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(formatBadge(input), expected, `formatBadge(${input})`);
  }
});

test("バッジは常に 4 文字以内", () => {
  for (let n = 0; n < 2e9; n = Math.max(n + 1, Math.floor(n * 1.013))) {
    for (const v of [n, n + 0.5]) {
      assert.ok(formatBadge(v).length <= 4, `formatBadge(${v}) = ${formatBadge(v)}`);
    }
  }
});

test("詳細表示の整形", () => {
  assert.equal(formatDetail(1.5, "en-US"), "1.5");
  assert.equal(formatDetail(2, "en-US"), "2");
  assert.equal(formatDetail(12345.5, "en-US"), "12,345.5");
});
