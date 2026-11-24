# SimpleCount

選択中テキストの文字数を拡張アイコンのバッジに表示するブラウザ拡張機能 (Vivaldi / Chrome / Edge などの Chromium 系、MV3)。

> **開発中 (v0.1.0)**: ストアには公開していません。デベロッパーモードで読み込んで使います。アイコンは仮のものです。

A browser extension (Manifest V3, Chromium-based browsers) that shows the character count of the selected text on the toolbar icon badge. Characters are counted as grapheme clusters, with options for half-width characters, excluded characters, spaces and newlines. The UI is available in Japanese and English. It is still in development and not published on any store; load it as an unpacked extension (see below).

## 機能

- 文字数は見た目どおりの書記素単位 (`Intl.Segmenter`) で数える
- 何も選択していないときは、フォーカス中の input / textarea の中身全体を数える (バッジが緑色になる)
- アイコンをクリックすると内訳 (全角 / 半角 / 空白 / 改行 / 除外) と数え方のスイッチを表示
- 数え方のオプション
  - 半角 (ASCII と半角カナ) を 2 文字で 1 文字と数える。バッジは切り上げ、ポップアップは小数で表示
  - 除外文字 (初期値 `、。，．､｡`)。設定ページで編集できる
  - 空白を含む / 改行を含む

## インストール (デベロッパーモード)

1. このリポジトリをクローンするか、ZIP でダウンロードして展開する
2. 拡張機能の管理ページを開く (Vivaldi: `vivaldi://extensions`、Chrome: `chrome://extensions`、Edge: `edge://extensions`)
3. 「デベロッパーモード」をオンにする
4. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダ (`manifest.json` があるフォルダ) を選ぶ
5. 読み込む前から開いていたタブは、再読み込みすると数えられるようになる

動作確認は主に Vivaldi で行っています。Firefox には未対応です (対応予定)。

## 権限

| 権限 | 理由 |
|---|---|
| すべてのサイトへのアクセス (content script) | 選択が変わるたびにバッジを更新するため。テキストは拡張機能の外に送信しない |
| `storage` | 設定の保存 (`sync`) と、タブごとの結果の一時保存 (`session`) |

## 既知の制限

- ブラウザの内部ページ (`vivaldi://` など)、PDF ビューア、拡張機能ストアでは数えられない
- Google ドキュメントのように canvas で描画するエディタでは、選択テキストを取得できない
- パスワード欄や `email` / `number` などの input は対象外

## 開発

依存パッケージもビルドもなし。カウントロジックのテストだけ Node (22 以上) で実行する。

```
npm test
```

| パス | 役割 |
|---|---|
| `src/shared/count.js` | カウントロジック (純粋関数)。`globalThis.SimpleCount` |
| `src/shared/settings.js` | 設定の既定値と `storage.sync` の読み書き |
| `src/content/content.js` | 選択の検出、間引き、background への送信 |
| `src/background/background.js` | タブ/フレームごとの状態保持とバッジ更新 |
| `src/popup/` | 詳細表示とスイッチ |
| `src/options/` | 設定ページ (除外文字の編集) |
| `tools/make-icons.ps1` | 仮アイコンの生成 (Windows / PowerShell 7 用) |

設計とフェーズの計画は [docs/plan.md](docs/plan.md) を参照。

## ライセンス

[MIT License](LICENSE)
