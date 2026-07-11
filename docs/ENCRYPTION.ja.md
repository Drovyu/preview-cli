# 暗号化設計

Drovyu Previewは、ファイルの内容を送信する前に利用者の端末上で暗号化します。この文書では、公開CLIが保証する動作、サービスから見える情報、検証方法を説明します。

## アップロードの流れ

1. CLIが`crypto.getRandomValues`で32バイトのランダムな鍵を生成します。
2. 鍵を取り出し不可能なAES-256-GCM暗号化鍵として読み込みます。
3. ファイルごとに異なる12バイトのランダムなIVを生成し、端末上で暗号化します。
4. ファイル送信APIには暗号文だけを送ります。
5. 元のパス、MIME type、サイズ、IV、entrypointを含むmanifestも、別のランダムなIVで暗号化します。
6. manifest送信APIには暗号化済みのenvelopeだけを送ります。
7. アップロード成功後、鍵を`#k=...` URL fragmentへ格納し、`~/.dvyu`にも保存します。

URL fragmentはHTTPリクエストに含まれません。CLIは`#k=`の値をリクエストURL、header、bodyのいずれにも送信しません。

## サービスから見える情報

サービスは次の暗号化されていないmetadataを受け取ります。

- preview IDとdevice ID
- 平文と暗号文の合計サイズ
- ファイル数と、ファイルごとのランダムなstorage key
- 作成日時、アクセス日時、有効期限
- 保持モードとアップロード状態

元のファイル内容、元のファイル名、MIME type、entrypoint、AES鍵の平文は受け取りません。

## 検証方法

次のコマンドを実行します。

```sh
pnpm test
```

`test/encryption-upload.test.mjs`はローカルHTTPサーバーを起動し、実際にビルドされたCLIを接続します。全リクエストを記録し、次の内容を検証します。

- 送信された全ファイルがAES-GCM暗号文であること
- 暗号文を復号すると元のローカルファイルと一致すること
- manifestが暗号化され、復号後のmetadataが正しいこと
- 元のファイル名や検査用の平文がmanifestリクエストに含まれないこと
- 256bit鍵とURL fragmentがどのHTTPリクエストにも含まれないこと

## 保証範囲と制限

公開ソースから確認できるのは、この実装の動作です。配布された実行物が同じソースから作られたことまで示すには、変更されないversion tag、CIで作成したartifact、SHA-256 checksumも公開する必要があります。

暗号化によって、完全なpreview URLを持たないサービス運営者から保存データを保護できます。ただし、アップロードしたHTMLをセキュリティsandboxにするものではありません。preview内のJavaScript実行や外部resourceの読み込みは可能なため、受信者は信頼できる送信者のpreviewだけを開いてください。
