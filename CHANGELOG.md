# 1.1.0 — 2026-10-16

- AdBlockの公開GitHubから起動・ハイライト・オーバーレイ・プレビュー・確認・保存・取消の流れを追跡し、対応表を同梱。
- HTTPページでは利用できない `crypto.randomUUID()` をcontent scriptから除去。`crypto.getRandomValues()` を使用。
- 初期化完了時だけコントローラーを公開し、失敗後に再試行可能に変更。
- 背景から依存ファイルを順に読み込み、コントローラーを明示的に起動して成功応答を確認。開始前の失敗を成功扱いしない。
- 管理画面が通常のタブとして開かれた場合の送信元判定を修正。拡張自身の正確なURLで判定。
- 透明な入力オーバーレイと座標からの要素取得を導入。iframeの外枠も選択可能。
- 本物のChrome拡張としてロードし、本物のツールバーポップアップから起動するE2Eテストを追加。従来テストの代替APIだけでは見逃していた不具合を回帰テスト化。
- 実行時の権限とデータ形式は維持。ChappyBlockと旧版ZIPは変更なし。

# 1.0.0 — 2026-10-16

新規拡張「Quiet Element」を作成。ChappyBlockおよび既存プロジェクトの変更なし。

| 新規ファイル | 内容 |
|---|---|
| extension/manifest.json | MV3、必要な4権限、サイト別の任意ホスト許可 |
| extension/background.js | 右クリック、注入、送信元検証、保存の直列化、自動実行登録、初期化 |
| extension/model.js | ホスト・セレクタ検証、重複排除、保存数制限、オンオフ・削除 |
| extension/core.js | 安全判定、一意なCSSセレクタ生成、曖昧な一致の回避 |
| extension/content.js | ハイライト、選択、プレビュー、確定・取消、復元、動的再適用 |
| extension/popup.html / options.html / ui.js / ui.css | サイト別・全体のルール管理と権限案内、日本語UI |
| tests/*.cjs | モデル、worker、DOM、UI、任意のネイティブE2E |
| tools/* / package.json | 静的検証、ZIP生成、開発用テストコマンド |
| README.md / docs/* | 導入、設計、制限、検証結果 |

本体はプレーンJavaScriptで、変換・バンドル工程は不要。ZIP生成前にManifestと構文・参照ファイルを検証する。
