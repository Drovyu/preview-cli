#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";
import { base64UrlDecode, base64UrlEncode } from "../shared.js";
import { ApiError, cancelUpload, createSupportClaim, createPreview, deleteAllPreviews, deletePreview, getApiUrl, getUsage, getSupportStatus, linkSupportDevice, listRemotePreviews, startSupportRecovery, updatePreview, unlinkSupportDevice, uploadFile, uploadManifest } from "./api.js";
import { buildCommand } from "./build.js";
import { encryptBytes, generatePreviewKey, hashSecret } from "./crypto.js";
import { collectInputFiles, formatBytes, UnsupportedFilesError } from "./files.js";
import { getLocalPreview, getLanguage, getOrCreateSupportStore, getSupportStore, listLocalPreviews, removeLocalPreview, removeLocalPreviewsByApiUrl, savePreview, saveSupportStore, setLanguage, uninstallLocalData } from "./store.js";
import { terminalText } from "./terminal.js";
const program = new Command();
const SUPPORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const language = await getLanguage();
const cliVersion = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")).version;
const messages = {
    en: {
        activePreviews: (active, limit) => `Active previews: ${active}/${limit}`,
        buildFailedCode: (code) => `Build failed with exit code ${code}`,
        buildFailedSignal: (signal) => `Build failed with signal ${signal}`,
        buildOutputNotFound: (outputPath) => `Build output not found: ${outputPath}`,
        buildOutputOption: "build output directory (Astro must configure the same outDir)",
        buildProjectArgument: "project directory to build and preview",
        createCommand: "Encrypt and upload a static preview",
        createPathArgument: "static file or directory to preview",
        deleteAllDone: "Deleted all previews",
        deleteCommand: "Delete a preview",
        deleteIdArgument: "preview id, or 'all'",
        deletedOne: (id) => `Deleted ${id}`,
        deletingOld: (id) => `Deleting old preview ${id}`,
        detectedProject: (builder) => `Detected ${builder} project`,
        entryNoLocalPreview: "No local preview found. Run dvyu create <path> first, or specify a preview id.",
        entryNoSourcePath: (id) => `Source path is not stored for ${id}. Specify a path.`,
        entrySource: "source",
        entryUnknownKey: "key not found locally",
        expires: "expires",
        langArgument: "language: en, english, ja, or japanese",
        langCommand: "Show or set CLI language",
        langCurrent: (lang) => `Current language: ${lang}`,
        langInvalid: (value) => `Unsupported language: ${value}. Use en or ja.`,
        langSet: (lang) => `Language set to ${lang}`,
        limit: "Limit",
        listCommand: "List saved local preview URLs",
        listAllOption: "include expired previews",
        listId: "ID",
        listItem: "Preview",
        listSize: "Size",
        listScopeArgument: "all: include expired previews",
        listScopeInvalid: (value) => `Unsupported list scope: ${value}. Use all.`,
        listStatus: "Status",
        listUrl: "URL",
        noInput: "No input specified. Run dvyu create <path>, or create dist/ or index.html first.",
        noPreviews: "No previews",
        nonInteractiveUnsupported: "Cannot ask for confirmation in this terminal. Re-run in an interactive terminal to continue after excluding these files.",
        owner: "Owner",
        packageJsonMissing: (projectPath) => `package.json not found in ${projectPath}`,
        packageJsonNoBuild: "package.json must define a build or build-storybook script.",
        permanenceOption: "supporter: keep the preview alive until it has no access for 1 month",
        permanentCleanup: "permanent, inactive cleanup",
        previewCreated: "Preview created",
        previewRebuilt: "Preview rebuilt",
        previewRecreated: "Preview recreated",
        previewUpdated: "Preview updated",
        programDescription: "Create encrypted Drovyu temporary previews",
        previewCommand: "Build a supported project, then create or recreate an encrypted preview",
        recreateCommand: "Delete an existing preview and create a new one from the same local path",
        recreatePathArgument: "static file or directory to preview again",
        recreateTargetArgument: "preview id to replace, or a path when id is omitted",
        remaining: "Remaining",
        removedLocalData: "Removed local Drovyu preview data",
        runBuild: (command) => `Running ${command}`,
        ttlInvalid: (value) => `Invalid TTL: ${value}. Use 1h to 30d, for example 6h or 7d.`,
        ttlConflict: "Use either --ttl or --permanence, not both.",
        ttlOption: "supporter: custom lifetime (1h to 30d, for example 7d)",
        statusActive: "active",
        statusExpired: "expired",
        statusUnknown: "unknown",
        uninstallCommand: "Remove local Drovyu preview settings, keys, and cache",
        unsupportedFiles: "Unsupported files were found.",
        unsupportedProject: "Unsupported project. dvyu preview currently supports Storybook, Astro, and Vite projects.",
        unsupportedQuestion: "Exclude these files and continue? [y/N] ",
        uploadCancelled: "Preview creation cancelled",
        usageCommand: "Show account usage",
        used: "Used",
        updateCommand: "Upload new content to an existing preview without changing its URL",
        updatePathArgument: "static file or directory to upload without changing the preview URL",
        updateTargetArgument: "preview id to update, or a path when id is omitted",
        uploadPreparing: (count, size) => `Preparing ${count} files (${size})`,
        uploadUploaded: "uploaded",
        uploadUploading: "Uploading files"
    },
    ja: {
        activePreviews: (active, limit) => `有効なプレビュー: ${active}/${limit}`,
        buildFailedCode: (code) => `ビルドが終了コード ${code} で失敗しました`,
        buildFailedSignal: (signal) => `ビルドがシグナル ${signal} で失敗しました`,
        buildOutputNotFound: (outputPath) => `ビルド出力が見つかりません: ${outputPath}`,
        buildOutputOption: "ビルド出力ディレクトリ（Astroでは同じoutDirの設定が必要）",
        buildProjectArgument: "ビルドしてプレビューするプロジェクトディレクトリ",
        createCommand: "静的ファイルを暗号化してプレビューを作成",
        createPathArgument: "プレビューする静的ファイルまたはディレクトリ",
        deleteAllDone: "すべてのプレビューを削除しました",
        deleteCommand: "プレビューを削除",
        deleteIdArgument: "プレビュー ID、または 'all'",
        deletedOne: (id) => `${id} を削除しました`,
        deletingOld: (id) => `古いプレビュー ${id} を削除しています`,
        detectedProject: (builder) => `${builder} プロジェクトを検出しました`,
        entryNoLocalPreview: "ローカルに保存されたプレビューが見つかりません。先に dvyu create <path> を実行するか、プレビュー ID を指定してください。",
        entryNoSourcePath: (id) => `${id} の元パスが保存されていません。パスを指定してください。`,
        entrySource: "保存元",
        entryUnknownKey: "復号キーはローカルにありません",
        expires: "期限",
        langArgument: "言語: en, english, ja, japanese",
        langCommand: "CLI の表示言語を確認・変更",
        langCurrent: (lang) => `現在の言語: ${lang}`,
        langInvalid: (value) => `未対応の言語です: ${value}。en または ja を指定してください。`,
        langSet: (lang) => `言語を ${lang} に変更しました`,
        limit: "上限",
        listCommand: "ローカルに保存されたプレビュー URL を一覧表示",
        listAllOption: "期限切れのプレビューも表示する",
        listId: "ID",
        listItem: "プレビュー",
        listSize: "容量",
        listScopeArgument: "all: 期限切れのプレビューも表示",
        listScopeInvalid: (value) => `未対応の一覧指定です: ${value}。all を指定してください。`,
        listStatus: "状態",
        listUrl: "URL",
        noInput: "入力が指定されていません。dvyu create <path> を実行するか、dist/ または index.html を用意してください。",
        noPreviews: "プレビューはありません",
        nonInteractiveUnsupported: "この端末では確認入力が使えないため中止しました。これらを除外して続行する場合は、対話可能な端末で再実行してください。",
        owner: "所有者",
        packageJsonMissing: (projectPath) => `${projectPath} に package.json が見つかりません`,
        packageJsonNoBuild: "package.json に build または build-storybook スクリプトが必要です。",
        permanenceOption: "支援者: 1ヶ月アクセスがない場合だけ削除されるプレビューにする",
        permanentCleanup: "永続・未アクセス削除予定",
        previewCreated: "プレビューを作成しました",
        previewRebuilt: "プレビューを再作成しました",
        previewRecreated: "プレビューを作り直しました",
        previewUpdated: "プレビューを更新しました",
        programDescription: "暗号化された Drovyu 一時プレビューを作成",
        previewCommand: "対応プロジェクトをビルドして暗号化プレビューを作成または再作成",
        recreateCommand: "既存プレビューを削除して同じローカルパスから新しく作成",
        recreatePathArgument: "再プレビューする静的ファイルまたはディレクトリ",
        recreateTargetArgument: "置き換えるプレビュー ID、または ID 省略時のパス",
        remaining: "残り容量",
        removedLocalData: "Drovyu Preview のローカルデータを削除しました",
        runBuild: (command) => `${command} を実行しています`,
        ttlInvalid: (value) => `有効期限の指定が正しくありません: ${value}。1hから30dまで（例: 6h、7d）を指定してください。`,
        ttlConflict: "--ttl と --permanence は同時に指定できません。",
        ttlOption: "支援者: 有効期限を変更（1hから30d、例: 7d）",
        statusActive: "有効",
        statusExpired: "期限切れ",
        statusUnknown: "状態不明",
        uninstallCommand: "Drovyu Preview のローカル設定、キー、キャッシュを削除",
        unsupportedFiles: "許可されていないファイルが含まれています。",
        unsupportedProject: "未対応のプロジェクトです。dvyu preview は現在 Storybook、Astro、Vite に対応しています。",
        unsupportedQuestion: "これらを除外してプレビューを作成しますか？ [y/N] ",
        uploadCancelled: "プレビュー作成を中止しました",
        usageCommand: "アカウント使用状況を表示",
        used: "使用量",
        updateCommand: "URL を変えずに既存プレビューの内容を更新",
        updatePathArgument: "プレビュー URL を変えずにアップロードする静的ファイルまたはディレクトリ",
        updateTargetArgument: "更新するプレビュー ID、または ID 省略時のパス",
        uploadPreparing: (count, size) => `${count} 個のファイルを準備中 (${size})`,
        uploadUploaded: "アップロード完了",
        uploadUploading: "ファイルをアップロード中"
    }
};
function t(key, ...values) {
    const message = messages[language][key];
    return typeof message === "function" ? message(...values) : message;
}
const helpTexts = {
    en: {
        root: `
Common workflows:
  dvyu preview                 Build Storybook/Astro/Vite, then create a preview
  dvyu create                  Upload ./dist, or ./index.html if dist is missing
  dvyu update                  Re-upload the latest local preview without changing its URL
  dvyu list                    Show URLs saved in ~/.dvyu/previews.json
  dvyu supporter              Show or configure supporter benefits
  dvyu list all                Include expired preview history
  dvyu lang ja                 Switch CLI messages to Japanese

Storage:
  Local keys and URLs are stored under ~/.dvyu.
  Preview links are encrypted. Keep the full URL including #k= private.
`,
        preview: `
Examples:
  dvyu preview
  dvyu preview ./my-app
  dvyu preview --out-dir build
  dvyu preview -p

Supported builders:
  Storybook -> builds to storybook-static by default
  Vite      -> builds to dist with a relative base
  Astro     -> builds normally to dist; the viewer resolves root asset paths

For Astro, --out-dir locates an outDir already configured in astro.config.*.
`,
        create: `
Examples:
  dvyu create
  dvyu create ./dist
  dvyu create ./index.html
  dvyu create ./dist -p

If path is omitted, dvyu uses ./dist when present, otherwise ./index.html.
The selected file or directory must contain an HTML entrypoint.
`,
        update: `
Examples:
  dvyu update
  dvyu update ./dist
  dvyu update <preview-id> ./dist
  dvyu update -p

Keeps the same preview URL and encryption key. If no id is given, the latest local preview is used.
`,
        recreate: `
Examples:
  dvyu recreate
  dvyu recreate ./dist
  dvyu recreate <preview-id> ./dist

Deletes the old preview and creates a new URL. Use dvyu update when the URL must stay the same.
`,
        list: `
Shows locally saved URLs from ~/.dvyu/previews.json.
Expired previews are hidden by default. Use dvyu list all or dvyu list -a to include them.
`,
        delete: `
Examples:
  dvyu delete <preview-id>
  dvyu delete all

Deleting all also clears local saved preview URLs.
`,
        usage: `
Shows remote account usage for this device id: storage, quota, and active preview count.
`,
        lang: `
Examples:
  dvyu lang
  dvyu lang en
  dvyu lang ja

The language setting is stored in ~/.dvyu/settings.json.
`,
        uninstall: `
Removes ~/.dvyu, including saved URLs, encryption keys, language settings, and device id.
`
    },
    ja: {
        root: `
よく使う流れ:
  dvyu preview                 Storybook/Astro/Vite をビルドしてプレビューを作成
  dvyu create                  ./dist、なければ ./index.html をアップロード
  dvyu update                  最新のローカルプレビューを URL 変更なしで再アップロード
  dvyu list                    ~/.dvyu/previews.json に保存された URL を表示
  dvyu supporter              支援者特典を確認・設定
  dvyu list all                期限切れのプレビュー履歴も表示
  dvyu lang en                 CLI 表示を英語に変更

保存先:
  復号キーと URL は ~/.dvyu 配下に保存されます。
  プレビューリンクは暗号化されています。#k= を含む完全な URL は必要な相手にだけ共有してください。
`,
        preview: `
例:
  dvyu preview
  dvyu preview ./my-app
  dvyu preview --out-dir build
  dvyu preview -p

対応ビルダー:
  Storybook -> 既定では storybook-static にビルド
  Vite      -> 既定では相対baseを指定してdistにビルド
  Astro     -> 通常どおりdistにビルドし、root asset pathはviewerで補完

Astroの--out-dirは、astro.config.*で設定済みのoutDirを指定するために使います。
`,
        create: `
例:
  dvyu create
  dvyu create ./dist
  dvyu create ./index.html
  dvyu create ./dist -p

パス省略時は ./dist を優先し、なければ ./index.html を使います。
選択したファイルまたはディレクトリには HTML のエントリーポイントが必要です。
`,
        update: `
例:
  dvyu update
  dvyu update ./dist
  dvyu update <preview-id> ./dist
  dvyu update -p

同じプレビュー URL と暗号化キーを維持します。ID 省略時は最新のローカルプレビューを使います。
`,
        recreate: `
例:
  dvyu recreate
  dvyu recreate ./dist
  dvyu recreate <preview-id> ./dist

古いプレビューを削除して新しい URL を作ります。URL を維持したい場合は dvyu update を使ってください。
`,
        list: `
~/.dvyu/previews.json に保存された URL を表示します。
通常は期限切れのプレビューを表示しません。履歴も確認する場合は dvyu list all または dvyu list -a を使います。
`,
        delete: `
例:
  dvyu delete <preview-id>
  dvyu delete all

all を指定すると、ローカルに保存されたプレビュー URL も削除します。
`,
        usage: `
この端末 ID のリモート使用状況を表示します。容量、上限、有効なプレビュー数を確認できます。
`,
        lang: `
例:
  dvyu lang
  dvyu lang en
  dvyu lang ja

言語設定は ~/.dvyu/settings.json に保存されます。
`,
        uninstall: `
~/.dvyu を削除します。保存 URL、暗号化キー、言語設定、端末 ID も削除されます。
`
    }
};
function helpText(key) {
    return helpTexts[language][key];
}
function parseTtl(value) {
    if (!value)
        return undefined;
    const match = value.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
    if (!match?.[1] || !match[2])
        throw new Error(t("ttlInvalid", value));
    const amount = Number(match[1]);
    const multiplier = match[2] === "m" ? 60 : match[2] === "h" ? 60 * 60 : 24 * 60 * 60;
    const seconds = amount * multiplier;
    if (!Number.isSafeInteger(seconds) || seconds < 60 * 60 || seconds > 30 * 24 * 60 * 60) {
        throw new Error(t("ttlInvalid", value));
    }
    return seconds;
}
function previewOptions(permanence, ttl) {
    const ttlSeconds = parseTtl(ttl);
    if (permanence && ttlSeconds !== undefined)
        throw new Error(t("ttlConflict"));
    return { permanence, ttlSeconds };
}
function truncateMiddle(value, maxLength) {
    if (value.length <= maxLength)
        return value;
    if (maxLength <= 3)
        return value.slice(0, maxLength);
    const left = Math.ceil((maxLength - 3) / 2);
    const right = Math.floor((maxLength - 3) / 2);
    return `${value.slice(0, left)}...${value.slice(value.length - right)}`;
}
function formatListDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short"
    }).format(date);
}
function printPreviewListItem(index, lines) {
    console.log(pc.bold(`${t("listItem")} ${index}`));
    for (const [label, value] of lines) {
        console.log(`  ${pc.dim(`${label}:`)} ${terminalText(value)}`);
    }
    console.log();
}
function createProgressBar(label, total) {
    let current = 0;
    const useTty = Boolean(process.stdout.isTTY);
    const width = 24;
    function render(itemLabel = "") {
        if (!useTty) {
            console.log(`${label} ${current}/${total}${itemLabel ? ` ${itemLabel}` : ""}`);
            return;
        }
        const ratio = total === 0 ? 1 : current / total;
        const filled = Math.round(ratio * width);
        const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
        const percent = `${Math.round(ratio * 100)}`.padStart(3, " ");
        const tail = itemLabel ? ` ${truncateMiddle(itemLabel, 34)}` : "";
        process.stdout.write(`\r${label} [${bar}] ${percent}% ${current}/${total}${tail}`);
    }
    render();
    return {
        tick(itemLabel) {
            current = Math.min(total, current + 1);
            render(itemLabel);
        },
        done(itemLabel) {
            current = total;
            render(itemLabel);
            if (useTty)
                process.stdout.write("\n");
        }
    };
}
function makeStorageKey() {
    return base64UrlEncode(crypto.getRandomValues(new Uint8Array(24)));
}
async function ensureSupportCredentials() {
    return getOrCreateSupportStore();
}
async function printSupportStatus() {
    const credentials = await getSupportStore();
    if (!credentials) {
        console.log(language === "ja"
            ? "支援者設定はまだありません。dvyu supporter start を実行してください。"
            : "Supporter setup has not started. Run dvyu supporter start.");
        return;
    }
    const status = await getSupportStatus(getApiUrl(), credentials.deviceToken);
    if (status.active) {
        console.log(pc.green(language === "ja" ? "支援者特典は有効です" : "Supporter benefits are active"));
        if (status.expiresAt)
            console.log(`${t("expires")}: ${formatListDate(status.expiresAt)}`);
        console.log(language === "ja"
            ? `登録端末: ${status.deviceCount ?? 0}/${status.maxDevices}`
            : `Linked devices: ${status.deviceCount ?? 0}/${status.maxDevices}`);
        console.log(language === "ja" ? "容量: 300MB / preview数: 無制限" : "Quota: 300MB / preview count: unlimited");
        return;
    }
    if (status.pending) {
        console.log(language === "ja" ? "Ko-fi支援の確認待ちです" : "Waiting for a matching Ko-fi payment");
        if (credentials.claimCode)
            console.log(`${language === "ja" ? "支援コード" : "Claim code"}: ${credentials.claimCode}`);
        if (status.claimExpiresAt)
            console.log(`${t("expires")}: ${formatListDate(status.claimExpiresAt)}`);
        return;
    }
    console.log(language === "ja" ? "支援者特典は無効です" : "Supporter benefits are inactive");
}
async function startSupportClaim() {
    const credentials = await ensureSupportCredentials();
    const claim = await createSupportClaim(getApiUrl(), credentials.deviceToken, await hashSecret(credentials.recoveryToken));
    await saveSupportStore({
        ...credentials,
        claimCode: claim.claimCode,
        claimExpiresAt: claim.expiresAt
    });
    console.log(pc.green(language === "ja" ? "支援コードを発行しました" : "Support claim created"));
    console.log(`${language === "ja" ? "支援コード" : "Claim code"}: ${terminalText(claim.claimCode)}`);
    console.log(language === "ja"
        ? "Ko-fi支援時の非公開メッセージへ、このコードをそのまま入力してください。"
        : "Put this code in the private message when supporting on Ko-fi.");
    console.log(terminalText(claim.kofiUrl));
}
async function promptSupportRecoveryEmail() {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error(language === "ja"
            ? "メールアドレスを安全に入力するため、対話可能な端末で実行してください。"
            : "Run this command in an interactive terminal to enter the email address safely.");
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const email = (await rl.question(language === "ja" ? "Ko-fiで使用したメールアドレス: " : "Email used for Ko-fi: ")).trim().toLowerCase();
        if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error(language === "ja" ? "メールアドレスが正しくありません" : "Invalid email address");
        }
        return email;
    }
    finally {
        rl.close();
    }
}
async function recoverSupportClaim() {
    const email = await promptSupportRecoveryEmail();
    const credentials = await ensureSupportCredentials();
    const claim = await createSupportClaim(getApiUrl(), credentials.deviceToken, await hashSecret(credentials.recoveryToken));
    await saveSupportStore({
        ...credentials,
        claimCode: claim.claimCode,
        claimExpiresAt: claim.expiresAt
    });
    await startSupportRecovery(getApiUrl(), credentials.deviceToken, email);
    console.log(pc.green(language === "ja" ? "認証メールの送信を受け付けました" : "Verification email request accepted"));
    console.log(language === "ja"
        ? "未紐付けのKo-fi支払いと一致する場合、認証リンクが届きます。リンク先で承認後、dvyu supporter status を確認してください。"
        : "If an unclaimed Ko-fi payment matches, a verification link will arrive. Approve it, then run dvyu supporter status.");
}
function getUploadConcurrency() {
    const configured = Number(process.env.DVYU_UPLOAD_CONCURRENCY ?? 6);
    return Number.isSafeInteger(configured) && configured >= 1 && configured <= 16 ? configured : 6;
}
async function shouldIgnoreUnsupportedFiles(error) {
    console.error(pc.yellow(t("unsupportedFiles")));
    for (const file of error.files) {
        console.error(`  ${terminalText(file.previewPath)}`);
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error(t("nonInteractiveUnsupported"));
        return false;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await rl.question(t("unsupportedQuestion"));
        return /^(y|yes|はい)$/i.test(answer.trim());
    }
    finally {
        rl.close();
    }
}
async function collectPreviewInputFiles(inputPath) {
    try {
        return await collectInputFiles(inputPath);
    }
    catch (error) {
        if (!(error instanceof UnsupportedFilesError))
            throw error;
        if (!await shouldIgnoreUnsupportedFiles(error))
            throw new Error(t("uploadCancelled"));
        return collectInputFiles(inputPath, { ignoreUnsupported: true });
    }
}
async function importEncryptionKey(keyString) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(keyString))
        throw new Error("Invalid local encryption key");
    const raw = base64UrlDecode(keyString);
    if (raw.byteLength !== 32)
        throw new Error("Invalid local encryption key");
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return crypto.subtle.importKey("raw", copy.buffer, "AES-GCM", false, ["encrypt"]);
}
async function prepareEncryptedPreview(inputPath, key) {
    const sourcePath = path.resolve(inputPath);
    const { files, entrypoint } = await collectPreviewInputFiles(sourcePath);
    const estimatedSize = files.reduce((sum, file) => sum + file.size, 0);
    const progress = createProgressBar(t("uploadPreparing", String(files.length), formatBytes(estimatedSize)), files.length);
    const encryptedFiles = [];
    let totalSize = 0;
    let encryptedSize = 0;
    for (const file of files) {
        const bytes = new Uint8Array(await readFile(file.absolutePath));
        const encrypted = await encryptBytes(key, bytes);
        totalSize += bytes.byteLength;
        encryptedSize += encrypted.encrypted.byteLength;
        const storageKey = makeStorageKey();
        encryptedFiles.push({
            path: file.previewPath,
            storageKey,
            bytes: encrypted.encrypted,
            meta: {
                path: file.previewPath,
                storageKey,
                mime: file.mime,
                size: bytes.byteLength,
                encryptedSize: encrypted.encrypted.byteLength,
                encryption: { alg: "AES-GCM", iv: encrypted.iv }
            }
        });
        progress.tick(terminalText(file.previewPath));
    }
    progress.done("encrypted");
    return { sourcePath, files: encryptedFiles, entrypoint, totalSize, encryptedSize };
}
async function uploadEncryptedPreview(apiUrl, id, uploadId, key, payload) {
    const progress = createProgressBar(t("uploadUploading"), payload.files.length + 1);
    let nextIndex = 0;
    let firstError;
    const workerCount = Math.min(getUploadConcurrency(), payload.files.length);
    const workers = Array.from({ length: workerCount }, async () => {
        while (firstError === undefined) {
            const index = nextIndex;
            nextIndex += 1;
            const file = payload.files[index];
            if (!file)
                return;
            try {
                await uploadFile(apiUrl, id, uploadId, file.storageKey, file.bytes);
                progress.tick(`${index + 1}/${payload.files.length} ${terminalText(file.path)}`);
            }
            catch (error) {
                firstError ??= error;
            }
        }
    });
    await Promise.all(workers);
    if (firstError !== undefined) {
        throw firstError;
    }
    const manifest = {
        version: 1,
        id,
        entrypoint: payload.entrypoint,
        files: payload.files.map((file) => file.meta)
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const encryptedManifestBytes = await encryptBytes(key, manifestBytes);
    const encryptedManifest = {
        version: 1,
        encryption: { alg: "AES-GCM", iv: encryptedManifestBytes.iv },
        ciphertext: base64UrlEncode(encryptedManifestBytes.encrypted)
    };
    await uploadManifest(apiUrl, id, uploadId, encryptedManifest);
    progress.tick("manifest");
    progress.done(t("uploadUploaded"));
}
async function requireSupporterOptions(apiUrl, options) {
    if (!options.permanence && options.ttlSeconds === undefined)
        return;
    const credentials = await getSupportStore();
    if (!credentials) {
        throw new Error(language === "ja"
            ? "このオプションは支援者限定です。dvyu supporter start を実行してください。"
            : "This option is for supporters. Run dvyu supporter start.");
    }
    const status = await getSupportStatus(apiUrl, credentials.deviceToken);
    if (!status.active) {
        throw new Error(language === "ja" ? "有効な支援者特典が必要です" : "Active supporter benefits are required");
    }
}
async function createEncryptedPreview(inputPath, apiUrl = getApiUrl(), options = {}) {
    await requireSupporterOptions(apiUrl, options);
    const { key, keyString } = await generatePreviewKey();
    const payload = await prepareEncryptedPreview(inputPath, key);
    const created = await createPreview(apiUrl, {
        totalSize: payload.totalSize,
        encryptedSize: payload.encryptedSize,
        fileCount: payload.files.length,
        files: payload.files.map((file) => ({ storageKey: file.storageKey, encryptedSize: file.bytes.byteLength })),
        ttlSeconds: options.ttlSeconds,
        permanence: options.permanence
    });
    try {
        await uploadEncryptedPreview(apiUrl, created.id, created.uploadId, key, payload);
    }
    catch (error) {
        await deletePreview(apiUrl, created.id).catch(() => undefined);
        throw error;
    }
    const url = `${created.previewUrl || `${apiUrl}/p/${created.id}`}#k=${keyString}`;
    await savePreview({
        id: created.id,
        key: keyString,
        url,
        apiUrl,
        sourcePath: payload.sourcePath,
        createdAt: created.createdAt,
        expiresAt: created.expiresAt,
        totalSize: payload.totalSize,
        entrypoint: payload.entrypoint
    });
    return { id: created.id, url };
}
async function updateEncryptedPreview(saved, inputPath, apiUrl = saved.apiUrl, options = {}) {
    await requireSupporterOptions(apiUrl, options);
    const key = await importEncryptionKey(saved.key);
    const payload = await prepareEncryptedPreview(inputPath, key);
    const updated = await updatePreview(apiUrl, saved.id, {
        totalSize: payload.totalSize,
        encryptedSize: payload.encryptedSize,
        fileCount: payload.files.length,
        files: payload.files.map((file) => ({ storageKey: file.storageKey, encryptedSize: file.bytes.byteLength })),
        ttlSeconds: options.ttlSeconds,
        permanence: options.permanence
    });
    try {
        await uploadEncryptedPreview(apiUrl, saved.id, updated.uploadId, key, payload);
    }
    catch (error) {
        await cancelUpload(apiUrl, saved.id, updated.uploadId).catch(() => undefined);
        throw error;
    }
    const url = `${updated.previewUrl || `${apiUrl}/p/${saved.id}`}#k=${saved.key}`;
    await savePreview({
        id: saved.id,
        key: saved.key,
        url,
        apiUrl,
        sourcePath: payload.sourcePath,
        createdAt: saved.createdAt || updated.createdAt,
        expiresAt: updated.expiresAt,
        totalSize: payload.totalSize,
        entrypoint: payload.entrypoint
    });
    return { id: saved.id, url };
}
async function pathExists(inputPath) {
    try {
        await stat(inputPath);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
async function resolveCreateInput(inputPath) {
    if (inputPath)
        return path.resolve(inputPath);
    const distPath = path.resolve("dist");
    if (await pathExists(distPath))
        return distPath;
    const indexPath = path.resolve("index.html");
    if (await pathExists(indexPath))
        return indexPath;
    throw new Error(t("noInput"));
}
async function resolveLocalPreviewTarget(target, inputPath) {
    const local = await listLocalPreviews();
    let id = target;
    let sourcePath = inputPath ? path.resolve(inputPath) : undefined;
    let saved = id ? await getLocalPreview(id) : local[0];
    if (target && !inputPath && !saved && await pathExists(target)) {
        saved = local[0];
        id = saved?.id;
        sourcePath = path.resolve(target);
    }
    id ??= saved?.id;
    sourcePath ??= saved?.sourcePath;
    if (!id || !saved) {
        throw new Error(t("entryNoLocalPreview"));
    }
    if (!sourcePath) {
        throw new Error(t("entryNoSourcePath", id));
    }
    return { saved, sourcePath };
}
async function readPackageJson(projectPath) {
    const packageJsonPath = path.join(projectPath, "package.json");
    try {
        return JSON.parse(await readFile(packageJsonPath, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(t("packageJsonMissing", projectPath));
        }
        throw error;
    }
}
function getDependencies(pkg) {
    return {
        ...pkg.dependencies,
        ...pkg.devDependencies
    };
}
function detectBuilder(pkg) {
    const dependencies = getDependencies(pkg);
    const buildScript = pkg.scripts?.build || "";
    const storybookBuildScript = pkg.scripts?.["build-storybook"] || "";
    if ("storybook" in dependencies ||
        Object.keys(dependencies).some((name) => name.startsWith("@storybook/")) ||
        /\b(?:storybook\s+build|build-storybook)\b/.test(buildScript) ||
        /\b(?:storybook\s+build|build-storybook)\b/.test(storybookBuildScript))
        return "storybook";
    if ("astro" in dependencies || /\bastro\s+build\b/.test(buildScript))
        return "astro";
    if ("vite" in dependencies || /\bvite\s+build\b/.test(buildScript))
        return "vite";
    return undefined;
}
function defaultOutDir(builder) {
    return builder === "storybook" ? "storybook-static" : "dist";
}
async function detectPackageManager(projectPath, pkg) {
    const configured = pkg.packageManager?.split("@")[0];
    if (configured)
        return configured;
    if (await pathExists(path.join(projectPath, "pnpm-lock.yaml")))
        return "pnpm";
    if (await pathExists(path.join(projectPath, "yarn.lock")))
        return "yarn";
    if (await pathExists(path.join(projectPath, "bun.lock")) || await pathExists(path.join(projectPath, "bun.lockb")))
        return "bun";
    if (await pathExists(path.join(projectPath, "package-lock.json")))
        return "npm";
    return "pnpm";
}
async function runBuild(projectPath, packageManager, builder, pkg, outDir) {
    const { command, args } = buildCommand(packageManager, builder, pkg, outDir);
    console.log(t("runBuild", terminalText(`${command} ${args.join(" ")}`)));
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: projectPath,
            stdio: "inherit",
            shell: process.platform === "win32"
        });
        child.on("error", reject);
        child.on("exit", (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(signal ? t("buildFailedSignal", signal) : t("buildFailedCode", String(code ?? "unknown"))));
        });
    });
}
async function replacePreview(id, sourcePath, apiUrl, options = {}) {
    await requireSupporterOptions(apiUrl, options);
    console.log(t("deletingOld", id));
    await deletePreview(apiUrl, id);
    await removeLocalPreview(id, apiUrl);
    const created = await createEncryptedPreview(sourcePath, apiUrl, options);
    return { ...created, replaced: true };
}
async function createOrRecreatePreview(sourcePath, apiUrl = getApiUrl(), options = {}) {
    const resolvedSourcePath = path.resolve(sourcePath);
    const local = await listLocalPreviews();
    const saved = local.find((item) => item.apiUrl === apiUrl && item.sourcePath === resolvedSourcePath);
    if (saved)
        return replacePreview(saved.id, resolvedSourcePath, apiUrl, options);
    const created = await createEncryptedPreview(resolvedSourcePath, apiUrl, options);
    return { ...created, replaced: false };
}
function registerBuildPreviewCommand() {
    program
        .command("preview")
        .argument("[project]", t("buildProjectArgument"), ".")
        .option("-o, --out-dir <path>", t("buildOutputOption"))
        .option("-p, --permanence", t("permanenceOption"))
        .option("--ttl <duration>", t("ttlOption"))
        .description(t("previewCommand"))
        .addHelpText("after", helpText("preview"))
        .action(async (project, options) => {
        const projectPath = path.resolve(project);
        const pkg = await readPackageJson(projectPath);
        const builder = detectBuilder(pkg);
        if (!builder) {
            throw new Error(t("unsupportedProject"));
        }
        if (!pkg.scripts?.build && !pkg.scripts?.["build-storybook"]) {
            throw new Error(t("packageJsonNoBuild"));
        }
        const outputPath = path.resolve(projectPath, options.outDir ?? defaultOutDir(builder));
        const packageManager = await detectPackageManager(projectPath, pkg);
        console.log(t("detectedProject", builder));
        await runBuild(projectPath, packageManager, builder, pkg, outputPath);
        if (!await pathExists(outputPath))
            throw new Error(t("buildOutputNotFound", outputPath));
        const { url, replaced } = await createOrRecreatePreview(outputPath, getApiUrl(), previewOptions(options.permanence, options.ttl));
        console.log(pc.green(replaced ? t("previewRebuilt") : t("previewCreated")));
        console.log(url);
    });
}
program
    .name("dvyu")
    .description(t("programDescription"))
    .configureHelp({
    styleTitle: (title) => {
        if (language !== "ja")
            return title;
        return {
            "Usage:": "使用方法:",
            "Arguments:": "引数:",
            "Options:": "オプション:",
            "Global Options:": "グローバルオプション:",
            "Commands:": "コマンド:"
        }[title] ?? title;
    },
    styleOptionText: (text) => language === "ja" && text === "[options]" ? "[オプション]" : text,
    styleSubcommandText: (text) => language === "ja" && text === "[command]" ? "[コマンド]" : text,
    styleArgumentText: (text) => {
        if (language !== "ja")
            return text;
        return {
            "[command]": "[コマンド]",
            "[language]": "[言語]",
            "[path]": "[パス]",
            "[project]": "[プロジェクト]",
            "[target]": "[対象]",
            "<id>": "<ID>",
            "<path>": "<パス>",
            "<preview-id>": "<プレビューID>"
        }[text] ?? text;
    },
    styleArgumentTerm: (text) => {
        if (language !== "ja")
            return text;
        return {
            id: "ID",
            language: "言語",
            path: "パス",
            project: "プロジェクト",
            target: "対象"
        }[text] ?? text;
    },
    styleArgumentDescription: (text) => language === "ja"
        ? text.replace(/\(default: ([^)]+)\)/g, "(既定値: $1)").replace(/\(choices: ([^)]+)\)/g, "(選択肢: $1)")
        : text,
    styleOptionTerm: (text) => {
        if (language !== "ja")
            return text;
        return text
            .replace(/<path>/g, "<パス>")
            .replace(/<preview-id>/g, "<プレビューID>");
    }
})
    .helpOption("-h, --help", language === "ja" ? "ヘルプを表示" : "display help for command")
    .helpCommand("help [command]", language === "ja" ? "コマンドのヘルプを表示" : "display help for command")
    .version(cliVersion, "-V, --version", language === "ja" ? "バージョンを表示" : "output the version number")
    .addHelpText("after", helpText("root"));
program
    .command("create")
    .argument("[path]", t("createPathArgument"))
    .option("-p, --permanence", t("permanenceOption"))
    .option("--ttl <duration>", t("ttlOption"))
    .description(t("createCommand"))
    .addHelpText("after", helpText("create"))
    .action(async (inputPath, options) => {
    const sourcePath = await resolveCreateInput(inputPath);
    const { url } = await createEncryptedPreview(sourcePath, getApiUrl(), previewOptions(options.permanence, options.ttl));
    console.log(pc.green(t("previewCreated")));
    console.log(url);
});
program
    .command("update")
    .argument("[target]", t("updateTargetArgument"))
    .argument("[path]", t("updatePathArgument"))
    .option("-p, --permanence", t("permanenceOption"))
    .option("--ttl <duration>", t("ttlOption"))
    .description(t("updateCommand"))
    .addHelpText("after", helpText("update"))
    .action(async (target, inputPath, options) => {
    const { saved, sourcePath } = await resolveLocalPreviewTarget(target, inputPath);
    const { url } = await updateEncryptedPreview(saved, sourcePath, saved.apiUrl, previewOptions(options.permanence, options.ttl));
    console.log(pc.green(t("previewUpdated")));
    console.log(url);
});
program
    .command("recreate")
    .argument("[target]", t("recreateTargetArgument"))
    .argument("[path]", t("recreatePathArgument"))
    .option("-p, --permanence", t("permanenceOption"))
    .option("--ttl <duration>", t("ttlOption"))
    .description(t("recreateCommand"))
    .addHelpText("after", helpText("recreate"))
    .action(async (target, inputPath, options) => {
    const { saved, sourcePath } = await resolveLocalPreviewTarget(target, inputPath);
    const { url } = await replacePreview(saved.id, sourcePath, saved.apiUrl, previewOptions(options.permanence, options.ttl));
    console.log(pc.green(t("previewRecreated")));
    console.log(url);
});
registerBuildPreviewCommand();
program
    .command("list")
    .argument("[scope]", t("listScopeArgument"))
    .option("-a, --all", t("listAllOption"))
    .description(t("listCommand"))
    .addHelpText("after", helpText("list"))
    .action(async (scope, options) => {
    if (scope && scope !== "all")
        throw new Error(t("listScopeInvalid", scope));
    const includeExpired = scope === "all" || options.all;
    const apiUrl = getApiUrl();
    const local = await listLocalPreviews();
    const apiUrls = [...new Set([apiUrl, ...local.map((item) => item.apiUrl)])];
    const remoteGroups = await Promise.all(apiUrls.map(async (savedApiUrl) => ({
        apiUrl: savedApiUrl,
        previews: await listRemotePreviews(savedApiUrl).catch(() => [])
    })));
    const remoteById = new Map(remoteGroups.flatMap((group) => group.previews.map((item) => [`${group.apiUrl}\n${item.id}`, item])));
    const active = remoteGroups.flatMap((group) => group.previews
        .filter((item) => item.status === "active")
        .map((preview) => ({ apiUrl: group.apiUrl, preview })));
    const visibleLocal = local.filter((saved) => {
        if (includeExpired)
            return true;
        const preview = remoteById.get(`${saved.apiUrl}\n${saved.id}`);
        return preview?.status !== "expired" && (preview || new Date(saved.expiresAt).getTime() > Date.now());
    });
    if (visibleLocal.length === 0 && active.length === 0) {
        console.log(t("noPreviews"));
        return;
    }
    let listIndex = 1;
    for (const saved of visibleLocal) {
        const preview = remoteById.get(`${saved.apiUrl}\n${saved.id}`);
        const status = preview?.status === "active"
            ? t("statusActive")
            : preview?.status === "expired"
                ? t("statusExpired")
                : new Date(saved.expiresAt).getTime() > Date.now() ? t("statusUnknown") : t("statusExpired");
        const size = preview ? formatBytes(preview.total_size) : formatBytes(saved.totalSize);
        const lifetime = preview?.retention_mode === "permanent"
            ? [t("permanentCleanup"), formatListDate(preview.expires_at)]
            : [t("expires"), formatListDate(preview?.expires_at ?? saved.expiresAt)];
        const lines = [
            [t("listId"), saved.id],
            [t("listStatus"), status],
            [t("listSize"), size],
            lifetime,
            [t("listUrl"), saved.url]
        ];
        if (saved.sourcePath)
            lines.push([t("entrySource"), saved.sourcePath]);
        printPreviewListItem(listIndex, lines);
        listIndex += 1;
    }
    const localIds = new Set(local.map((item) => `${item.apiUrl}\n${item.id}`));
    for (const activePreview of active) {
        const { preview, apiUrl: previewApiUrl } = activePreview;
        if (localIds.has(`${previewApiUrl}\n${preview.id}`))
            continue;
        const lifetime = preview.retention_mode === "permanent"
            ? [t("permanentCleanup"), formatListDate(preview.expires_at)]
            : [t("expires"), formatListDate(preview.expires_at)];
        printPreviewListItem(listIndex, [
            [t("listId"), preview.id],
            [t("listStatus"), t("statusActive")],
            [t("listSize"), formatBytes(preview.total_size)],
            lifetime,
            [t("listUrl"), `${previewApiUrl}/p/${preview.id} (${t("entryUnknownKey")})`]
        ]);
        listIndex += 1;
    }
});
program
    .command("lang")
    .argument("[language]", t("langArgument"))
    .description(t("langCommand"))
    .addHelpText("after", helpText("lang"))
    .action(async (value) => {
    if (!value) {
        console.log(t("langCurrent", language));
        return;
    }
    const normalized = value.toLowerCase();
    const nextLanguage = normalized === "ja" || normalized === "japanese"
        ? "ja"
        : normalized === "en" || normalized === "english"
            ? "en"
            : undefined;
    if (!nextLanguage)
        throw new Error(t("langInvalid", value));
    await setLanguage(nextLanguage);
    console.log(messages[nextLanguage].langSet instanceof Function ? messages[nextLanguage].langSet(nextLanguage) : messages[nextLanguage].langSet);
});
const supporterCommand = program
    .command("supporter")
    .description(language === "ja" ? "Ko-fi支援者特典を確認・設定" : "Show or configure Ko-fi supporter benefits")
    .action(printSupportStatus);
supporterCommand
    .command("start")
    .description(language === "ja" ? "Ko-fi支援コードを発行" : "Create a Ko-fi support claim code")
    .action(startSupportClaim);
supporterCommand
    .command("status")
    .description(language === "ja" ? "支援者特典の状態を表示" : "Show supporter benefit status")
    .action(printSupportStatus);
supporterCommand
    .command("recover")
    .description(language === "ja" ? "支援コードを入れ忘れた支払いをメールで紐付け" : "Recover a payment made without a claim code by email")
    .action(recoverSupportClaim);
supporterCommand
    .command("link")
    .argument("<recovery-token>", language === "ja" ? "1台目のrecovery token" : "recovery token from the first device")
    .description(language === "ja" ? "2台目を支援者特典へ登録" : "Link a second device")
    .action(async (recoveryToken) => {
    if (!SUPPORT_TOKEN_PATTERN.test(recoveryToken))
        throw new Error(language === "ja" ? "recovery tokenが正しくありません" : "Invalid recovery token");
    const credentials = await ensureSupportCredentials();
    const status = await linkSupportDevice(getApiUrl(), credentials.deviceToken, await hashSecret(recoveryToken));
    await saveSupportStore({ ...credentials, recoveryToken });
    console.log(pc.green(language === "ja" ? "この端末を支援者特典へ登録しました" : "This device now has supporter benefits"));
    if (status.expiresAt)
        console.log(`${t("expires")}: ${formatListDate(status.expiresAt)}`);
});
supporterCommand
    .command("recovery")
    .description(language === "ja" ? "2台目登録用tokenを表示" : "Show the token used to link a second device")
    .action(async () => {
    const credentials = await getSupportStore();
    if (!credentials)
        throw new Error(language === "ja" ? "支援者設定がありません" : "Supporter setup has not started");
    console.log(language === "ja" ? "このtokenはパスワードと同様に扱ってください。" : "Treat this token like a password.");
    console.log(credentials.recoveryToken);
});
supporterCommand
    .command("unlink")
    .description(language === "ja" ? "この端末の支援者特典を解除" : "Unlink supporter benefits from this device")
    .action(async () => {
    const credentials = await getSupportStore();
    if (!credentials)
        throw new Error(language === "ja" ? "支援者設定がありません" : "Supporter setup has not started");
    await unlinkSupportDevice(getApiUrl(), credentials.deviceToken);
    console.log(language === "ja" ? "この端末を解除しました" : "This device was unlinked");
});
program
    .command("delete")
    .argument("<id>", t("deleteIdArgument"))
    .description(t("deleteCommand"))
    .addHelpText("after", helpText("delete"))
    .action(async (id) => {
    const apiUrl = getApiUrl();
    if (id === "all") {
        await deleteAllPreviews(apiUrl);
        await removeLocalPreviewsByApiUrl(apiUrl);
        console.log(t("deleteAllDone"));
        return;
    }
    const saved = await getLocalPreview(id);
    const targetApiUrl = saved?.apiUrl ?? apiUrl;
    await deletePreview(targetApiUrl, id);
    await removeLocalPreview(id, targetApiUrl);
    console.log(t("deletedOne", id));
});
program
    .command("usage")
    .description(t("usageCommand"))
    .addHelpText("after", helpText("usage"))
    .action(async () => {
    const usage = await getUsage(getApiUrl());
    console.log(`${t("owner")}: ${usage.owner}`);
    console.log(`${t("used")}: ${formatBytes(usage.usedBytes)}`);
    console.log(`${t("remaining")}: ${formatBytes(usage.remainingBytes)}`);
    console.log(`${t("limit")}: ${formatBytes(usage.quotaBytes)}`);
    console.log(usage.activePreviewLimit === null
        ? `${t("activePreviews", String(usage.activePreviews), language === "ja" ? "無制限" : "unlimited")}`
        : t("activePreviews", String(usage.activePreviews), String(usage.activePreviewLimit)));
    if (usage.supporter && usage.supporterExpiresAt) {
        console.log(`${language === "ja" ? "支援者特典" : "Supporter benefits"}: ${formatListDate(usage.supporterExpiresAt)}`);
    }
});
program
    .command("uninstall")
    .description(t("uninstallCommand"))
    .addHelpText("after", helpText("uninstall"))
    .action(async () => {
    await uninstallLocalData();
    console.log(t("removedLocalData"));
});
program.parseAsync().catch((error) => {
    if (error instanceof ApiError) {
        console.error(pc.red(`${error.message}: ${terminalText(error.body)}`));
        process.exitCode = 1;
        return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(pc.red(terminalText(message)));
    process.exitCode = 1;
});
