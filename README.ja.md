# Drovyu Preview CLI

> **ソース公開型ですが、オープンソースではありません。** このリポジトリは透明性と
> セキュリティ検証のために公開します。公式CLIの無改変での利用は
> [Drovyu Source-Available License](LICENSE)で許可しますが、改変、再配布、派生物の作成、
> 独立したサービス運営への利用は許可していません。

[English](README.md)

静的ビルドから一時的なプレビューリンクを作成する CLI です。

CLIは各ファイルとmanifestをローカルで暗号化してからアップロードします。AES鍵は
`#k=` URL fragmentにだけ保持され、HTTPリクエストでは送信されません。詳細と実行可能な
検証方法は[暗号化設計](docs/ENCRYPTION.ja.md)を参照してください。

```sh
dvyu create ./dist
```

Drovyu Preview は、Vite、React、Storybook などの静的ビルドを、本番公開せずに共有したいときに使います。

## インストール

必要なもの:

- Node.js 20 以上
- Vite `dist` や Storybook の静的出力などのビルド済みディレクトリ

npm packageからインストール:

```sh
pnpm add -g @dvyu/cli
npm install -g @dvyu/cli
```

最新の`main` branchを使う場合はGitHubから直接インストールできます。

```sh
pnpm add -g github:Drovyu/preview-cli
npm install -g github:Drovyu/preview-cli
yarn global add https://github.com/Drovyu/preview-cli.git
```

プレビューを作成:

```sh
dvyu create ./dist
```

インストールせずnpmから一度だけ実行する場合:

```sh
pnpm dlx @dvyu/cli create ./dist
npx @dvyu/cli create ./dist
yarn dlx @dvyu/cli create ./dist
```

GitHubから一度だけ実行する場合:

```sh
pnpm dlx github:Drovyu/preview-cli create ./dist
npx github:Drovyu/preview-cli create ./dist
yarn dlx github:Drovyu/preview-cli create ./dist
```

## コマンド

```sh
dvyu create [path]
dvyu update
dvyu preview [project]
dvyu recreate
dvyu list
dvyu delete <id>
dvyu delete all
dvyu usage
dvyu lang [en|ja]
dvyu supporter
dvyu supporter start
dvyu supporter status
dvyu supporter recover
dvyu supporter recovery
dvyu supporter link <recovery-token>
dvyu supporter unlink
dvyu uninstall
```

## 使い方

Storybook、Astro、Vite プロジェクトをビルドしてプレビュー:

```sh
dvyu preview
```

`dvyu preview` は対象プロジェクトの `package.json` を読み、静的出力としてビルドしてから出力ディレクトリをプレビューします。同じ出力パスのプレビューがローカルに残っている場合は、古いプレビューを削除して作り直します。

対応しているビルダー:

- Storybook
- Astro
- Vite

既定の出力ディレクトリは Astro / Vite が `dist`、Storybook が `storybook-static` です。

```sh
dvyu preview ./my-app
dvyu preview --out-dir build
dvyu preview -p
dvyu preview --ttl 7d
```

ビルド済みディレクトリからプレビューを作成:

```sh
dvyu create
dvyu create ./dist
dvyu create ./dist -p
```

パスを省略した場合、`dist` があれば `dist`、なければ `index.html` を使います。
選択したファイルまたはディレクトリには HTML ファイルが必要です。エントリーポイントは `index.html` を優先し、なければ最初の `.html` ファイルを使います。
支援者は `create`、`update`、`recreate`、`preview` に `-p`（`--permanence`）を付けると、1ヶ月アクセスがない場合だけ削除されるプレビューを作れます。`--ttl 7d` のように `1h` から `30d` までの有効期限も指定できます。`-p` と `--ttl` は同時に指定できません。

単一ファイルからプレビューを作成:

```sh
dvyu create ./example.html
```

最新のローカルプレビューを URL 変更なしで更新:

```sh
dvyu update
dvyu update ./dist
dvyu update <id> ./dist
dvyu update -p
```

最新のプレビューを同じローカルパスから作り直す:

```sh
dvyu recreate
```

`recreate` は古いプレビューを削除して新しい URL を作ります。URL を変えたくない場合は `update` を使います。

最新のプレビューを指定パスから作り直す:

```sh
dvyu recreate ./dist
```

ローカルに保存済みのプレビュー URL 一覧を表示:

```sh
dvyu list
```

`dvyu list` は `~/.dvyu/previews.json` を読み、有効なプレビューを表示します。期限切れのローカル履歴も確認する場合は `dvyu list all` または `dvyu list -a` を使います。ローカルに復号キーがない有効なプレビューは `#k=` なしで表示されます。

プレビューを削除:

```sh
dvyu delete <id>
```

この端末で作成したプレビューをすべて削除:

```sh
dvyu delete all
```

利用量を確認:

```sh
dvyu usage
```

CLI の表示言語を確認・変更:

```sh
dvyu lang
dvyu lang en
dvyu lang ja
```

言語設定は `~/.dvyu/settings.json` に保存されます。

### Ko-fi 支援者特典

Ko-fiで支援する前に、1台目の端末で支援コードを発行します。

```sh
dvyu supporter start
```

表示された `DVYU-...` をKo-fi支払い時の非公開メッセージへ含めると、その支払いから通常30日間、端末が自動登録されます。支援コードの有効期限は24時間で、初回の端末登録には支援前に発行したコードが必要です。状態は次のコマンドで確認できます。

```sh
dvyu supporter
dvyu supporter status
```

支援時にコードを入れ忘れた場合は、メール認証で救済できます。

```sh
dvyu supporter recover
```

Ko-fiで使用したメールアドレスを対話入力します。未紐付けの支払いと一致すると、15分有効の認証リンクが届きます。リンクを開いただけでは登録されず、確認画面の「この端末を登録」を押すと完了します。承認後は`dvyu supporter status`で確認できます。

- 救済できるのは、支払日から30日以内の未紐付け支払いだけです。
- 特典期限は認証日ではなく、元のKo-fi支払日から30日です。
- 同じメールアドレスへの送信は3回/24時間、同じ端末からの申請は5回/24時間です。
- 再送には60秒の間隔が必要です。
- 支払いと一致しない場合も同じ受付メッセージを表示し、メールアドレスの登録有無を外部から判別できないようにします。
- 生のメールアドレスはD1へ保存しません。照合用HMACだけを保存し、認証メール送信時にResendへ宛先として渡します。

2台目を登録する場合は、1台目でrecovery tokenを表示し、2台目で登録します。

```sh
# 1台目
dvyu supporter recovery

# 2台目
dvyu supporter link <recovery-token>
```

recovery tokenは支援者特典へ端末を登録できる秘密情報です。パスワードと同様に扱ってください。登録できる端末は同時に2台までです。端末の登録解除には `dvyu supporter unlink` を使います。解除しても、その端末で作成済みのプレビューは削除されず、引き続き同じ支援者容量へ計上されます。

支援者特典:

- 通常は支払いから30日間有効
- 同時プレビュー数の上限なし
- 有効な容量: 2端末合計で`300MB`
- `-p` / `--permanence`
- `--ttl <duration>` による `1時間` から `30日` の期限指定
- 通常利用枠が満杯でも、支援者reserveの範囲内で作成可能
- 支援者プレビューではDrovyuのプレビューバッジを非表示

支援期間が終了すると、新しい`-p` / `--ttl`付きプレビューは作成できなくなります。既存の永続プレビューは直ちに削除されませんが、アクセスによる期限延長を停止し、その時点の削除予定日までは閲覧できます。再支援で既存の特典期限が短くなることはありません。

支援者credentialは`~/.dvyu/support.json`へ保存されます。device tokenとrecovery tokenを含むため、このファイルを共有したりrepositoryへcommitしたりしないでください。

Drovyu Preview のローカルデータを削除:

```sh
dvyu uninstall
```

## 対応ファイル

対応していないファイルが含まれる場合、アップロードは開始前に中止されます。
`.DS_Store`、`.gitkeep`、`Thumbs.db` などのよくあるメタファイルは自動で無視します。それ以外の非対応ファイルが見つかった場合は、確認後に除外して続行できます。

対応拡張子:

```txt
.html .htm .md .txt .json .xml .map
.css .js .mjs .cjs
.png .jpg .jpeg .gif .svg .webp .ico .avif
.woff .woff2 .ttf .otf
.mp4 .webm .mp3 .wav
.pdf
```

アップロードルートに `index.html` がある場合は、それをプレビューのエントリーポイントとして使います。

暗号化完了後のファイル送信は既定で6並列です。回線やproxyの制約に合わせる場合は、`DVYU_UPLOAD_CONCURRENCY`へ`1`から`16`を指定できます。

```sh
DVYU_UPLOAD_CONCURRENCY=3 dvyu create ./dist
```

## アセットパス

安定して表示するには、静的サイトを相対アセットパスでビルドするのが理想です。`dvyu preview`はViteへ相対baseと選択した出力先を渡します。Astroの`base`は持ち運べる相対baseではなくデプロイ先pathnameなので通常どおりビルドし、root asset pathをDrovyu viewer側で補完します。Storybookは静的ビルドを実行し、既定では`storybook-static`を使います。

Astroなど一部のビルダーは`/_astro/...`のようなroot pathを出力します。Drovyu Previewのviewerは、下層ページも含めて同一originのasset linkを補完します。ただし外部originへの完全な絶対URLはそのまま扱います。

手動でビルドしてから `dvyu create` する場合は、以下を優先してください。

```sh
vite build --base=./
astro build
```

生成された静的ディレクトリをアップロードします。

```sh
dvyu create ./dist
```

## 制限

既定の制限:

| 項目 | 通常利用 | 支援者 |
| --- | ---: | ---: |
| 有効な容量 | `100MB` / 端末 | `300MB` / 支援者（2端末合計） |
| 有効なプレビュー数 | `20` / 端末 | 無制限 |
| 通常の有効期限 | `48時間` | `48時間`、または`--ttl`で`1時間`から`30日` |
| 永続オプション | 利用不可 | `-p` / `--permanence` |
| 登録端末 | 端末単位 | 最大`2台` |

サービス全体では通常利用枠を`3GiB`、支援者reserveを追加`7GiB`、絶対上限を`10GiB`とします。通常利用は全体使用量が3GiBへ達すると停止し、支援者だけが10GiBまでのreserveを利用できます。

期限切れのプレビューは閲覧できなくなります。支援者の永続プレビューはアクセスされるたびに未アクセス削除の期限が延長されます。支援者reserveは全支援者で共有され、個別の`300MB`上限も適用されます。

## 公開利用統計

LPなどの公開ページでは、認証不要の集計APIを利用できます。個別のdevice ID、preview ID、URL、復号キーは返しません。

```http
GET https://preview.drovyu.com/api/public/stats
```

```json
{
  "devices": 1,
  "devicesEver": 1,
  "previewsCreated": 3,
  "encryptedBytesPublished": 1068949,
  "encryptedGigabytesPublished": 0.001,
  "lastPublishedAt": "2026-07-10T08:00:00.000Z",
  "updatedAt": "2026-07-11T00:17:00.000Z"
}
```

- `devices`: 集計時点で有効なプレビューを1件以上持つユニーク端末数。「利用中のデバイス」に使います。
- `devicesEver`: これまでプレビュー公開に1回以上成功したユニーク端末数。累計利用者数の近似値です。
- `previewsCreated`: 公開に成功したユニークpreview URL数。`update`は増加しません。
- `encryptedBytesPublished`: 公開に成功したファイル暗号文の累計byte数。`update`で公開した新generationも加算します。
- `encryptedGigabytesPublished`: 上記を10進のGB（`1GB = 1,000,000,000 bytes`）へ変換し、小数第3位まで丸めた値です。
- `lastPublishedAt`: 最後にプレビューまたは更新を公開した時刻です。公開実績がなければ`null`です。
- `updatedAt`: 集計スナップショットを更新した時刻です。

集計は毎日1回、`09:17 JST`頃に更新します。最大約24時間の遅延があります。レスポンスはCORSを許可し、1時間cacheできます。LPではraw byteから任意の桁数で表示することもできます。

```js
const stats = await fetch("https://preview.drovyu.com/api/public/stats")
  .then((response) => response.json());

console.log(`${stats.devices}台`);
console.log(`${stats.previewsCreated}回`);
console.log(`${stats.encryptedGigabytesPublished.toFixed(3)}GB`);
```

## 注意

- プレビューリンクは、信頼できる相手への一時共有を想定しています。
- Drovyu Preview は完全なセキュリティサンドボックスではありません。
- ビューアーは暗号化プレビュー内の同一オリジンのアセットリンクを補完しますが、特殊なランタイムルーティングや外部絶対 URL のアセットはプロジェクト側の調整が必要になる場合があります。
- 発行されたプレビューリンクは公開せず、必要な相手にだけ共有してください。
