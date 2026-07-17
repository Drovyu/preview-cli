# Security Policy

## Reporting a vulnerability

Do not post preview URLs, `#k=` decryption keys, local configuration files, or
other sensitive reproduction data in a public issue. Support recovery links,
claim codes, recovery tokens, Resend API keys, and `.dev.vars` are also private.

Use GitHub's private vulnerability reporting feature when it is available for
this repository. Otherwise, contact the maintainer through a private channel
listed by Drovyu and include only the minimum reproduction data needed.

## Scope

The public repository is intended to make the CLI encryption and upload path,
the browser Viewer, and the decryption Service Worker reviewable. A report may
cover those components, the encrypted transfer protocol, or a behavioral
mismatch between the published source and an official build. Server API,
storage, quota, supporter, and operational implementation remain out of scope
for the public snapshot.

このリポジトリの公開issueへ、プレビューURL、`#k=`復号キー、ローカル設定
ファイルなどの機密情報を投稿しないでください。GitHubの非公開脆弱性報告、
またはDrovyuが案内する非公開の連絡手段を使用してください。
