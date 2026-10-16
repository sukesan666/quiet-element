# 検証結果 — Quiet Element 1.1.0

実施日：2026-10-16（日本時間）。Windows / Google Chrome 155.0.8059.40 / Playwright 1.62.1。

## 結果

**合計33件成功、0件失敗。内訳：従来のモデル・境界・DOM/UIテスト28件、ネイティブ拡張E2E 5件。**

| 検証 | 件数・結果 |
|---|---|
| 保存モデル | 6件成功：重複、削除・オンオフ・初期化、上限、特殊文字、安全検証 |
| service worker境界 | 7件成功：同時保存、送信元、ホスト権限、保存失敗、初期化、USER CSS、タブで開く管理画面の送信元 |
| 実ブラウザーのセレクタ | 7件成功：一意性、重複クラス、保護領域、特殊文字、Shadow DOM、巨大コンテナ |
| 実ブラウザーの選択UI | 5件成功：枠、プレビュー、取消、リンクの誤操作防止、保存・再適用、動的DOM、保存エラー、Tab |
| 実ブラウザーの管理UI | 3件成功：各オンオフ、削除、初期化の取消と実行、権限拒否 |
| ネイティブ拡張E2E | 5件成功：下記参照 |
| Manifest・権限・参照ファイル・JS構文 | 成功 |
| ZIP生成・内容照合 | 検証付きビルドで生成し、展開内容とソースのハッシュを照合 |
| 独立コードレビュー | HTTP初期化、順次注入・起動確認、送信元検証、iframe外枠の選択方式をレビュー。未解決の重大指摘なし |

## ネイティブ拡張として確認したこと

旧版ではコマンドラインの拡張読み込みが成立せず、この部分を未確認のまま納品していました。今回はChrome公式の開発者向けCDPを利用し、専用の一時プロファイルに**本物の拡張をロード**してテストできるようにしました。

`tests/native-e2e.cjs` の5ケース：

1. **HTTPページ、本体そのままのManifest、永続ホスト許可なし**：実際の拡張ツールバーアクション → 本物のpopup.html → 選択開始、プレビュー、USER CSS非表示、取消、ページ再読み込み後に再起動、Esc。
2. **HTTPSページ、同じ条件**：同じ起動・非表示・取消の確認。
3. **自動適用を許可された状態の一時テスト用Manifest**：保存、実際のstorage.local、一意なセレクタ、自動content script登録、ページ再読み込み後の適用、重複する動的要素を隠さないこと、USERオリジンCSSでインライン `display:block!important` を隠すこと、本物のoptions.htmlから全体・サイト・個別のオンオフと削除。
4. **クロスオリジンiframeの外枠**：iframe上をクリックして最上位ページのiframe要素を選び、非表示にしてEscで復元。iframe内部へのスクリプト注入は行わない。
5. **初期化失敗からの再試行**：テスト内で初期化を意図的に失敗させ、エラー表示後、ページを再読み込みせずに同じポップアップから再試行して起動できること。

1・2・4・5は配布するManifestに追加権限を入れずに実行しました。3だけは無人テストでネイティブ許可ダイアログを処理しないため、一時コピーへ `http://example.test/*` と `https://example.test/*` のホスト許可を付けています。**配布本体の必須ホスト権限は増やしていません。**

ネイティブE2EはChrome APIを代替実装に置き換えていません。API境界アダプターを使うテストは別の28件です。

## 修正前の失敗も確認

- 1.0.0のHTTP起動：content.jsの `crypto.randomUUID is not a function` を捕捉。受信相手が見つからないエラーになり、UIは0件。HTTPSでは起動することも比較して原因を確認。
- 本物のoptions.html：画面に「無効な操作元です。」が表示され、管理できないことを再現。
- 旧入力方式のiframe選択：クリックがiframe内へ入り、非表示プレビューにならないことを再現。

各不具合の失敗を確認してから修正し、対応する回帰テストを通しました。根拠とAdBlockとの対応は [ADBLOCK-TRACE.md](ADBLOCK-TRACE.md) に記載しています。

## 実行コマンド

この環境にはnpm実行ファイルがないため、package.jsonのスクリプトと同じNode.jsコマンドを直接実行しました。

```powershell
# PLAYWRIGHT_PATH と CHROME_PATH は利用可能なパッケージ・Chromeのフルパス
node --test tests/model.cjs tests/worker.cjs tests/browser.cjs tests/runtime.cjs tests/ui.cjs tests/native-e2e.cjs
node tools/check.cjs
powershell -ExecutionPolicy Bypass -File tools/build.ps1
```

テスト用の `--enable-unsafe-extension-debugging` は専用Chromeプロセスだけに付けます。利用者のChromeの設定・既存プロファイル・インストール済み拡張には変更を加えていません。

## 自動テストに含まない手動確認

- Chromeのネイティブ右クリックメニューそのものの表示・クリック。実装は検証済みの同じ `start()` を呼びます。
- Chromeのネイティブサイトアクセス許可ダイアログで許可・拒否を押す操作。拒否後のUIと保存維持は境界テストで確認しています。
- Chromeプロセスを終了・再起動した後の復元。保存とページ再読み込み時の実際の自動適用は確認済みです。
- あらゆる実サイトの特殊CSS、Shadow DOM、独自スクリプトとの組合せ。READMEの対象外・制限を参照してください。

導入時は `chrome://extensions/` でバージョン **1.1.0** を確認し、対象Webページも再読み込みしてください。前版と新版を同時に有効にしないでください。

`popup-preview.png` / `picker-preview.png` はテストページのUI参考画像です。`picker-native.png` はChromeへ実際に拡張を読み込んだネイティブE2E中の参考画像です。
