# SimpleCount 実装フェーズプラン

選択中テキストの文字数を拡張アイコンのバッジに表示する Vivaldi 拡張機能。将来 Firefox 対応。

## 前提となる決定事項

| 項目 | 決定 |
|---|---|
| 対象 | Vivaldi (Chromium, MV3)。manifest は Chrome/Firefox 共通の 1 ファイル |
| 1文字の定義 | 書記素単位 (`Intl.Segmenter`) |
| 半角換算 | ASCII 表示文字 + 半角カナを 0.5 文字として数える (オプション) |
| 除外文字 | ユーザーが編集できるリスト。初期値 `、。，．､｡` |
| 空白 / 改行 | 別々のスイッチ。初期値: 空白を含む ON / 改行を含む OFF |
| 端数 | 詳細画面は小数、バッジは切り上げ |
| バッジ形式 | 〜9999 はそのまま、10000〜 `12k`、1000000〜 `1.2M` |
| 未選択時 | input/textarea にフォーカスがあればその中身全体を数え、バッジの色を変える。それ以外は空欄 |
| 取得範囲 | ページ本文 + input/textarea + iframe (最後に選択が変わったフレームを採用) |
| 未対応ページ | バッジ空欄、ポップアップで「このページでは使えません」 |
| ポップアップ | 反映後の数 + 内訳 (全角/半角/空白/改行/除外) + ON/OFF スイッチ |
| 設定ページ | 除外文字リストの編集 |
| 更新頻度 | 約100ms 間隔で間引く。10万文字超はドラッグが止まってから 1 回だけ数える |
| 配布 | 当面はデベロッパーモードでの読み込みのみ (ストア未公開)。UI 文字列は最初から `_locales` |
| 開発環境 | 素の JS、ビルドなし、カウントロジックは `node --test` |

## ファイル構成 (予定)

```
simplecount/
├─ manifest.json
├─ package.json            # "type": "module", "test": "node --test" のみ。依存ゼロ
├─ _locales/{ja,en}/messages.json
├─ icons/                  # 16/32/48/128
├─ src/
│  ├─ shared/
│  │  ├─ count.js          # 純粋関数のカウントロジック (globalThis.SimpleCount に登録)
│  │  └─ settings.js       # 設定スキーマ・既定値・storage 読み書き
│  ├─ content/content.js   # 選択の検出、間引き、数えた結果の送信
│  ├─ background/background.js  # タブ/フレームごとの状態管理、バッジ更新
│  ├─ popup/{popup.html,popup.js,popup.css}
│  └─ options/{options.html,options.js,options.css}
├─ test/count.test.js
└─ docs/plan.md
```

`count.js` は `export` を使わず `globalThis.SimpleCount` に登録する。こうすると、同じ 1 ファイルを次の 3 通りで読み込める。

- content script: manifest の `js` 配列で先頭に置く
- popup / options: `<script src>` で読み込む
- テスト: `import '../src/shared/count.js'` (副作用として読み込む)

## 設定スキーマ

```js
{
  halfWidthAsHalf: false,        // 半角を 0.5 文字で数える
  excludeEnabled: true,          // 除外文字リストを使う
  excludedChars: "、。，．､｡",
  includeSpaces: true,
  includeNewlines: false
}
```

保存先は `chrome.storage.sync`。

---

## Phase 0: 土台づくり

**やること**
- `git init`、`.gitignore` を作る
- `manifest.json` を書く
  - `manifest_version: 3`
  - `background`: `service_worker` と `scripts` を両方書く (Chrome は前者、Firefox は後者を採用する)
  - `browser_specific_settings.gecko.id` を仮の値で書いておく
  - `permissions: ["storage"]`
  - `content_scripts`: `matches: ["<all_urls>"]`, `all_frames: true`, `match_about_blank: true`, `run_at: "document_idle"`
  - `action.default_popup`, `options_ui`
  - `default_locale: "ja"`、名前と説明は `__MSG_*__` にする
- `_locales/ja` と `en` の雛形を作る
- 仮アイコン (単色の「字」など) を置く
- `package.json` (依存なし、`npm test` だけ)

**完了条件**
- Vivaldi の `vivaldi://extensions` で読み込むとエラーなしで表示され、アイコンをクリックすると空のポップアップが開く
- `npm test` が (テスト 0 件で) 通る

## Phase 1: カウントロジック + テスト

**やること** (`src/shared/count.js`)
- `analyze(text, settings)` は次の値を返す
  ```js
  {
    total,          // 反映後の数 (小数あり)
    fullWidth,      // 全角 (1 文字として数えたもの) の書記素数
    halfWidth,      // 半角の書記素数
    spaces,         // 空白の書記素数
    newlines,       // 改行の書記素数 (\r\n は 1)
    excluded,       // 除外した書記素数
    graphemes       // 全書記素数 (参考)
  }
  ```
- 分類ルール (書記素ごと、上から順に判定)
  1. 改行 (`\r\n`, `\n`, `\r`, U+2028/2029) → `newlines`。`includeNewlines` が ON なら 1 文字として数える
  2. 空白 (半角スペース、タブ、全角スペース U+3000 など) → `spaces`。`includeSpaces` が ON なら数える。半角換算が ON なら、半角スペースとタブは 0.5、全角スペースは 1
  3. 除外リストに含まれる → `excluded`。数えない
  4. 半角 (書記素を構成する全コードポイントが U+0021–007E または U+FF61–FF9F) → `halfWidth`。半角換算が ON なら 0.5
  5. それ以外 → `fullWidth`。1
- `formatBadge(total)`: 切り上げてから `""`(0 のとき) / `"123"` / `"12k"` / `"1.2M"` に整形する
- `formatDetail(total)`: 小数第 1 位まで (`1.5`、整数なら `2`)
- `Intl.Segmenter` のインスタンスは使い回す

**テストケース** (`test/count.test.js`)
- 絵文字 ZWJ 列 `👨‍👩‍👧` = 1、国旗 `🇯🇵` = 1、結合濁点 `か゛` = 1
- 半角換算: `abc` → 1.5、`Hello, world!` → 6.5、`ＡＢＣ` → 3
- 半角カナ `ｶﾞ`: `Intl.Segmenter` では 1 書記素になる → 0.5 (下の「未決の細部」を参照)
- 除外: 初期リストで `こんにちは、世界。` → 7。リストが空、または `excludeEnabled: false` なら 9
- 空白・改行: `a b\nc` を 4 通りの設定の組み合わせで数える、`\r\n` は 1 改行
- 空文字 → 0、バッジは `""`
- バッジ整形の境界: 9999 → `9999`、9999.5 → `10k`、10000 → `10k`、12345 → `12k`、999999 → `1000k` (5 文字) になってしまわないか、1000000 → `1M`、1234567 → `1.2M`

**完了条件**
- `npm test` がすべて通る
- バッジ文字列が常に 4 文字以内になることを、テストで保証する

## Phase 2: content script (選択の取得)

**やること** (`src/content/content.js`)
- 選択テキストを取り出す
  - フォーカス中の要素が `input` (text 系) / `textarea` なら `value.slice(selectionStart, selectionEnd)`
  - それ以外は `getSelection().toString()`
- 未選択時の扱い: フォーカス中の要素が input/textarea で選択範囲が空なら、`value` 全体を数え、`mode: "field"` とする
- 監視するイベント: `selectionchange` (document)、`input`、`focusin` / `focusout`
  - input/textarea の中で `selectionchange` が発生するかは、Vivaldi 実機で確認する。発生しない場合は `select` / `keyup` / `mouseup` で補う
- 間引き: 先頭で 1 回すぐ実行し、以降は 100ms ごと (leading + trailing の throttle)
- 巨大な選択: `text.length > 100000` のときは throttle をやめ、最後の変化から 150ms 後に 1 回だけ数える
- 設定の読み込み: 起動時に `storage.sync` から読み、`storage.onChanged` で受け取ったら数え直す
- background に送る: `{ type: "count", mode: "selection" | "field" | "none", result, ts }`
  - 前回と同じ結果なら送らない
- `pagehide` のときは `mode: "none"` を送る

**完了条件**
- 次の各場面で選択すると、DevTools のログに正しい結果が出る
  - 通常ページ、textarea、input、contenteditable、iframe (例: CodePen の埋め込み)
- 数十万文字のページで Ctrl+A → ドラッグしてもカクつかない

## Phase 3: background (バッジ管理)

**やること** (`src/background/background.js`)
- 状態は `chrome.storage.session` に `tab:<tabId>` → `{ frameId, mode, result, ts }` として保存する
  - MV3 の service worker は停止することがあるので、メモリには置かない
- 複数フレームの扱い
  - 選択のあるメッセージを受けたら、そのフレームを採用する
  - 採用中のフレームから `none` が来たら、状態をクリアする
  - 採用中以外のフレームから来た `none` は無視する
- バッジ更新: `action.setBadgeText({ tabId, text })`、`setBadgeBackgroundColor({ tabId, color })`
  - `selection`: 通常色
  - `field`: 別の色
- 状態をクリアするタイミング
  - `tabs.onRemoved`
  - `tabs.onUpdated` で `status: "loading"` になったとき (トップフレームのページ遷移)
- 未対応ページ: content script が動かないので、状態がないまま空欄になる。ポップアップ側で判定する (Phase 4)

**完了条件**
- タブを切り替えると、そのタブの数がバッジに出る
- ページを遷移するとバッジが消える
- service worker を手動で停止してから選択し直しても、正しく動く

## Phase 4: ポップアップ

**やること** (`src/popup/`)
- 開いたときに、アクティブなタブの状態を `storage.session` から読み込む
- 表示内容
  - メインの数 (小数あり)。その上に「選択範囲」か「入力欄全体」かのラベル
  - 内訳: 全角 / 半角 / 空白 / 改行 / 除外
  - スイッチ: 半角換算 / 除外を使う / 空白を含む / 改行を含む
  - 設定ページへのリンク (`runtime.openOptionsPage()`)
- 未対応ページの判定
  - `tabs.sendMessage` で ping を送り、応答がなければ「このページでは使えません」と表示する
  - URL で判定する方法ではなく、応答の有無で判定する (`vivaldi://`、PDF、Webストアなどをまとめて扱える)
  - ping に応答するため、`tabs` の権限なしで済むよう、content script 側に `runtime.onMessage` を置く
- スイッチを切り替えたら `storage.sync` に書き込む
  - content script が数え直してバッジを更新する
  - ポップアップは `storage.session` の変化を監視して表示を更新する
- 文字列はすべて `chrome.i18n.getMessage` 経由にする

**完了条件**
- スイッチを切り替えると、ポップアップの数字とバッジが両方すぐ変わる
- `vivaldi://settings` や PDF でアイコンをクリックすると、「使えません」と表示される

## Phase 5: 設定ページ

**やること** (`src/options/`)
- 除外文字リストの編集欄 (1 行のテキスト。1 書記素を 1 つの除外文字として扱う)
- 「初期値に戻す」ボタン
- 保存の方式: 入力して一定時間たったら自動保存し、「保存しました」と表示する
- `storage.sync` の容量制限 (1 項目 8KB) を超える入力はエラーとして扱う
- ポップアップのスイッチ類も、同じ内容を設定ページにまとめて置く (一覧できるように)

**完了条件**
- 除外文字を追加すると、開いている全タブの数字に反映される

## Phase 6: 仕上げと Vivaldi での動作確認

**やること**
- アイコンを本番用のデザインに差し替える (16/32/48/128)
- 英語の `_locales/en` を埋める
- バッジ色を最終決定する (ライトテーマとダークテーマの両方で読めるか確認する)
- 手動テストのチェックリストを `docs/manual-test.md` にまとめて、1 周確認する
  - Vivaldi 固有: タブスタック、分割表示 (タイル)、パネル内の Web パネル、ツールバーにアイコンを出していない状態
  - Gmail、Google ドキュメント (canvas 描画なので取得できない想定。その場合の見え方も確認する)
  - X の投稿欄、GitHub のコメント欄
- README を書く (読み込み手順、機能、権限の理由)

**完了条件**
- チェックリストの項目がすべて通過、または既知の制限として README に書いてある

## Phase 7 (将来): Firefox 対応

**やること**
- `browser_specific_settings.gecko.id` を本番用の値にし、`strict_min_version` を設定する (`Intl.Segmenter` が使える 125 以上)
- `about:debugging` で読み込み、Phase 6 のチェックリストを Firefox で確認する
- Firefox で差が出そうな点を確認する
  - `storage.session` と、background のイベントページとしての動作
  - `<all_urls>` のホスト権限が、インストール時に付与されるか
  - input/textarea 内で `selectionchange` が発生するか
- 差を吸収しきれなくなったら、WXT への移行を検討する
- AMO 公開用に、プライバシーポリシーを書き (データは外部に送らない)、`web-ext lint` を実行する

---

## 未決の細部 (実装中に決める。既定案つき)

| 項目 | 既定案 |
|---|---|
| 半角換算・除外の初期値 | 半角換算 OFF / 除外 ON |
| `ｶﾞ` (半角カナ + 半角濁点) | 1 書記素なので 0.5。原稿の数え方 (2 文字で 1) と合わない場合は、濁点を別に数える |
| タブ文字 | 空白として扱う |
| バッジ色 | 選択中 `#4a6fa5` / 入力欄全体 `#5a8f5a` (Phase 6 で調整) |
| k / M の端数 | **決定:** 切り捨て (`12345` → `12k`、`1234567` → `1.2M`)。`1000k` にならない |

---

## 進捗

| Phase | 状態 | 備考 |
|---|---|---|
| 0 | 完了 | 仮アイコンは `tools/make-icons.ps1` で生成 |
| 1 | 完了 | `npm test` 10 件通過 |
| 2〜5 | 実装済み・自動確認済み | ヘッドレス Edge + CDP で 11 項目を確認 (本文 / 設定変更による再計算 / 選択解除 / textarea と input の全体モード / 部分選択 / 入力 / iframe / 20万文字 / ping / ページ遷移)。Vivaldi はヘッドレスモードでページを操作できないため、Vivaldi 実機での確認は Phase 6 の手動テストで行う |
| 6 | 未着手 | README の初版は作成済み |
| 7 | 未着手 | |
