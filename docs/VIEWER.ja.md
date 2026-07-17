# Viewerの公開範囲と信頼境界

Drovyu Previewは、CLIまたはブラウザで暗号化されたファイルを受け取り、Viewer内で
復号して表示します。平文ファイルと`#k=`の復号キーはDrovyuのAPIへ送信しません。

## 公開するコード

- `src/viewer/`: コメント、通知設定、通知Service Worker
- `dist/viewer-static/`: 本番Workerが配信する上記コードのJavaScript
- `viewer-reference/preview-service-worker.js`: 暗号化manifestとファイルを取得し、
  ブラウザ内でAES-GCM復号するService Workerの参照出力
- `viewer-reference/viewer-shell.html`: 復号キーをURL fragmentから読み、Service Workerへ
  `postMessage`で渡すViewer shellの参照出力
- `viewer-reference/SHA256SUMS`: 参照出力のSHA-256

参照出力内のpreview IDは`000000000000000000000000`へ固定しています。本番ではpreview
ごとにこの設定値が変わりますが、復号・通信処理は同じテンプレートから生成されます。

## 公開しないコード

API routing、D1/R2操作、容量制限、不正利用対策、支援者判定、Cron、メール送信、Webhook、
運用監視は公開対象に含めません。これらは「ブラウザ内で復号すること」の検証に不要で、
認証なしサービスへの攻撃情報を増やすためです。

## 確認できること

`preview-service-worker.js`では、次の順序を確認できます。

1. `/manifest`と`/file`から暗号化データを取得する
2. 復号キーをViewer windowから`postMessage`で受け取る
3. `crypto.subtle.decrypt`をブラウザ内で実行する
4. 復号したレスポンスをpreview iframeへ返す

復号キーはURL fragmentに置かれます。URL fragmentは通常のHTTP request targetへ含まれないため、
Viewer shellはキーをAPI URL、query、header、request bodyへ追加しません。

## 限界

公開ソースだけで、本番サーバーが常に同一コードを配信していることまでは暗号学的に証明
できません。公開コードは実装のレビューと、取得した本番JavaScriptとの比較を可能にする
ものです。また、Viewer JavaScriptを配信するWorkerは信頼境界に含まれます。機密情報、
NDA対象、個人情報など、配信基盤を信頼できない用途には使用しないでください。
