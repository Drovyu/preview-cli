import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
export const configDir = path.join(homedir(), ".dvyu");
const storePath = path.join(configDir, "previews.json");
const devicePath = path.join(configDir, "device.json");
const settingsPath = path.join(configDir, "settings.json");
const supportPath = path.join(configDir, "support.json");
const lockPath = `${configDir}.lock`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCK_TIMEOUT_MS = 35_000;
const STALE_LOCK_MS = 30_000;
async function acquireStoreLock() {
    await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
    const startedAt = Date.now();
    while (true) {
        try {
            const handle = await open(lockPath, "wx", 0o600);
            const token = `${process.pid}:${randomUUID()}`;
            try {
                await handle.writeFile(token);
                return { handle, token };
            }
            catch (error) {
                await handle.close().catch(() => undefined);
                await rm(lockPath, { force: true }).catch(() => undefined);
                throw error;
            }
        }
        catch (error) {
            if (error.code !== "EEXIST")
                throw error;
            try {
                const info = await stat(lockPath);
                if (Date.now() - info.mtimeMs > STALE_LOCK_MS) {
                    await rm(lockPath, { force: true });
                    continue;
                }
            }
            catch (statError) {
                if (statError.code === "ENOENT")
                    continue;
                throw statError;
            }
            if (Date.now() - startedAt >= LOCK_TIMEOUT_MS)
                throw new Error("Timed out waiting for the local dvyu store lock");
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }
}
async function withStoreLock(action) {
    const lock = await acquireStoreLock();
    try {
        return await action();
    }
    finally {
        await lock.handle.close().catch(() => undefined);
        const currentToken = await readFile(lockPath, "utf8").catch(() => undefined);
        if (currentToken === lock.token)
            await rm(lockPath, { force: true }).catch(() => undefined);
    }
}
function isLocalPreview(value) {
    if (!value || typeof value !== "object")
        return false;
    const item = value;
    return (typeof item.id === "string" && /^[0-9a-f]{24}$/i.test(item.id) &&
        typeof item.key === "string" && /^[A-Za-z0-9_-]{43}$/.test(item.key) &&
        typeof item.url === "string" &&
        typeof item.apiUrl === "string" &&
        typeof item.createdAt === "string" &&
        typeof item.expiresAt === "string" &&
        typeof item.totalSize === "number" && Number.isSafeInteger(item.totalSize) && item.totalSize >= 0 &&
        typeof item.entrypoint === "string" &&
        (item.sourcePath === undefined || typeof item.sourcePath === "string"));
}
async function writePrivateJson(filePath, value) {
    await mkdir(configDir, { recursive: true, mode: 0o700 });
    await chmod(configDir, 0o700);
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
        await rename(temporaryPath, filePath);
        await chmod(filePath, 0o600);
    }
    catch (error) {
        await rm(temporaryPath, { force: true });
        throw error;
    }
}
async function readStore() {
    try {
        const raw = await readFile(storePath, "utf8");
        const parsed = JSON.parse(raw);
        return { previews: Array.isArray(parsed.previews) ? parsed.previews.filter(isLocalPreview) : [] };
    }
    catch (error) {
        if (error.code === "ENOENT")
            return { previews: [] };
        throw error;
    }
}
async function writeStore(store) {
    await writePrivateJson(storePath, store);
}
export async function savePreview(preview) {
    await withStoreLock(async () => {
        const store = await readStore();
        store.previews = [preview, ...store.previews.filter((item) => item.id !== preview.id || item.apiUrl !== preview.apiUrl)];
        await writeStore(store);
    });
}
export async function listLocalPreviews() {
    return (await readStore()).previews;
}
export async function getLocalPreview(id) {
    return (await readStore()).previews.find((item) => item.id === id);
}
export async function removeLocalPreview(id, apiUrl) {
    await withStoreLock(async () => {
        const store = await readStore();
        store.previews = store.previews.filter((item) => item.id !== id || (apiUrl !== undefined && item.apiUrl !== apiUrl));
        await writeStore(store);
    });
}
export async function removeLocalPreviewsByApiUrl(apiUrl) {
    await withStoreLock(async () => {
        const store = await readStore();
        store.previews = store.previews.filter((item) => item.apiUrl !== apiUrl);
        await writeStore(store);
    });
}
export async function getLanguage() {
    try {
        const raw = await readFile(settingsPath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.language === "ja" || parsed.language === "en")
            return parsed.language;
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
    return "en";
}
export async function setLanguage(language) {
    await withStoreLock(() => writePrivateJson(settingsPath, { language }));
}
async function readDeviceId() {
    try {
        const raw = await readFile(devicePath, "utf8");
        const parsed = JSON.parse(raw);
        if (typeof parsed.id === "string" && UUID_PATTERN.test(parsed.id))
            return parsed.id.toLowerCase();
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
    return undefined;
}
export async function getDeviceId() {
    const existing = await readDeviceId();
    if (existing)
        return existing;
    return withStoreLock(async () => {
        const concurrent = await readDeviceId();
        if (concurrent)
            return concurrent;
        const device = {
            id: randomUUID(),
            createdAt: new Date().toISOString()
        };
        await writePrivateJson(devicePath, device);
        return device.id;
    });
}
function isSupportStore(value) {
    if (!value || typeof value !== "object")
        return false;
    const item = value;
    return (typeof item.deviceToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(item.deviceToken) &&
        typeof item.recoveryToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(item.recoveryToken) &&
        (item.claimCode === undefined || /^DVYU-[A-Z2-9]{10}$/.test(item.claimCode)) &&
        (item.claimExpiresAt === undefined || typeof item.claimExpiresAt === "string"));
}
export async function getSupportStore() {
    try {
        const parsed = JSON.parse(await readFile(supportPath, "utf8"));
        return isSupportStore(parsed) ? parsed : undefined;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
export async function getOrCreateSupportStore() {
    const existing = await getSupportStore();
    if (existing)
        return existing;
    return withStoreLock(async () => {
        const concurrent = await getSupportStore();
        if (concurrent)
            return concurrent;
        const created = {
            deviceToken: randomBytes(32).toString("base64url"),
            recoveryToken: randomBytes(32).toString("base64url")
        };
        await writePrivateJson(supportPath, created);
        return created;
    });
}
export async function saveSupportStore(store) {
    if (!isSupportStore(store))
        throw new Error("Invalid supporter credentials");
    await withStoreLock(() => writePrivateJson(supportPath, store));
}
export async function uninstallLocalData() {
    await withStoreLock(() => rm(configDir, { recursive: true, force: true }));
}
