# AdBlock「要素をブロック」のトレースとQuiet Element 1.1.0

調査日：2026-10-16。対象は [betafish-inc/adblock-releases](https://github.com/betafish-inc/adblock-releases) の公開 `master`。これは公開されているAdBlockのコードであり、現在のストア版と同じ版であるとは扱っていません。Adblock Plusの別リポジトリと取り違えず、AdBlock側の `adblock-betafish/uiscripts/blacklisting/` を調査しました。

## 処理を追った順序

1. **開始要求**：[contextmenus.js](https://github.com/betafish-inc/adblock-releases/blob/master/adblock-betafish/contextmenus.js) の `blockThisAd` / `blockAnAd`、`showBlacklist` メッセージから `emitPageBroadcast` へ進みます。
2. **依存の読み込み**：同ファイルの `injectMap.topOpenBlacklistUI` にUI依存が並びます。`executeOnTab` がファイルを1つずつ読み込み、完了してから `topOpenBlacklistUI` を明示的に実行します。古い `tabs.executeScript` と文字列コード注入をそのままMV3へ持ち込むことはしません。
3. **UI生成と二重起動の防止**：[top_open_blacklist_ui.js](https://github.com/betafish-inc/adblock-releases/blob/master/adblock-betafish/uiscripts/top_open_blacklist_ui.js) はダイアログのロック、Shadow DOM、キャンセル時のロック解除を担当します。[load_wizard_resources.js](https://github.com/betafish-inc/adblock-releases/blob/master/adblock-betafish/uiscripts/load_wizard_resources.js) はUI資源の準備完了後に処理を進めます。
4. **要素を選ぶ**：[clickwatcher.js](https://github.com/betafish-inc/adblock-releases/blob/master/adblock-betafish/uiscripts/blacklisting/clickwatcher.js) の `Highlighter` / `ClickWatcher` が対象の位置を可視化します。iframe内部を横断せず、[overlay.js](https://github.com/betafish-inc/adblock-releases/blob/master/adblock-betafish/uiscripts/blacklisting/overlay.js) のオーバーレイで外枠を選択する方針でした。
5. **範囲を調整する**：[elementchain.js](https://github.com/betafish-inc/adblock-releases/blob/master/adblock-betafish/uiscripts/blacklisting/elementchain.js) は選択した要素から親・子へ移動し、BODYまで拡大しないようにします。
6. **プレビュー・確定・保存**：[blacklistui.js](https://github.com/betafish-inc/adblock-releases/blob/master/adblock-betafish/uiscripts/blacklisting/blacklistui.js) は選択、非表示確認、セレクタの確認、ホスト名付きカスタムフィルターの保存を別の段階にしています。`makeFilter` は要素の属性を使い、`buildPage2` が保存要求、`blockListViaCSS` が現在ページへの反映を行います。
7. **取消**：`preview(null)` と `onClose` が一時的な表示変更を取り消し、イベントとUIの終了処理に進みます。

## 今回の実装との対応

| AdBlock側で確認した役割 | Quiet Element 1.1.0 |
|---|---|
| 依存を順番に注入し、最後に起動関数を呼ぶ | background.js の `start()`：core → content → 公開コントローラーの明示起動。結果が `started:true` の場合だけ成功 |
| ダイアログのロックと終了時の解放 | content.js のバージョン付きコントローラー、二重起動の抑止、`close()` / `dispose()` |
| UIをページのCSSから隔離 | Shadow DOMの確認パネル |
| オーバーレイで要素とiframe外枠を選択 | 透明な入力面＋`elementsFromPoint()`。パネルを除外し、背後の最上位ページ要素を取得 |
| 選択した位置のハイライト | 要素の矩形に追従する枠。スクロール・リサイズ時に再計算 |
| 一時プレビューと永続保存を別にする | クリックはプレビューのみ。「確定して保存」で初めて保存 |
| サイト付きの要素非表示ルール | 正確なホスト名＋安全判定を通したCSSセレクタをローカル保存 |
| 取消で戻す | 一時属性だけを解除。元のインラインスタイルを変更しない |

AdBlockと同じ広告エンジンを組み込んだわけではありません。AdBlock固有の通信遮断、テレメトリー、プレミアム表示、jQueryやDOMPurifyなどは持ち込んでいません。属性をまとめて使うAdBlockのセレクタ方式をそのまま複製せず、当初の要件に合わせて一意なID・クラス・親子パスを優先し、複数一致は隠さない保守的な方式を維持しています。親要素をスライダーで広げる代わりに、本版では「選び直す」で再選択します。

## 前版の不具合と再現証拠

### HTTPで起動しない

本物のChromeへ1.0.0の配布Manifestを読み込み、HTTPページで実際のツールバーポップアップを操作すると、content.jsの初期化で `crypto.randomUUID is not a function` が発生しました。HTTPのページコンテキストではこのAPIがありません。メッセージ受信口を作る前に例外となり、背景側では受信相手が見つからないエラーになります。加えて初期化前に「読み込み済み」を立てたため、その後の注入でも復旧しませんでした。

修正：HTTPでも利用できる `getRandomValues()` で識別子を生成し、初期化完了後にのみ準備完了を公開。起動処理は成功応答まで確認します。初期化エラーを意図的に発生させ、同じページで再試行できるネイティブテストも追加しました。

### 全サイト管理画面が通信できない

実際のChromeでは、タブで開いたoptions.htmlの送信元にも `sender.tab` が入ります。前版はそれだけで拡張自身のUIを拒否していました。ネイティブテストで「無効な操作元です。」を再現しました。

修正：自分自身の拡張IDと正確なpopup/optionsのURLを確認し、`sender.tab` の有無を信頼条件にしない方式にしました。外部ページや他拡張の許可範囲は広げていません。

## 出典・ライセンスの扱い

参照元は [COPYING](https://github.com/betafish-inc/adblock-releases/blob/master/COPYING) および各ファイルのヘッダーでGPLv3が示されています。本配布には上流のコード、ロゴ、フォント、画像、ライブラリーをコピーしていません。処理の役割と流れを調査し、今回の要件に合わせて独立したMV3コードとして実装しています。調査した元ファイルと関数を上記のリンクで追跡可能にしています。

調査対象のGit blob（`blacklisting` 一覧から確認）：`blacklistui.js` = `0e9ac9a135794d613ac90968a5d8885c0dcc721a`、`clickwatcher.js` = `72280cc4ecf968de4d1246c9b0b69e16d74d1b03`、`elementchain.js` = `706673904ad6a4db5ff4ca9647b830df3396843e`、`overlay.js` = `570445f5b3bc27df8c3284b19b25ca88ffad4fd1`。上流のmasterが更新される場合は、この識別子で調査対象を区別できます。
