import { getDeviceId, getSupportStore } from "./store.js";
export class ApiError extends Error {
    status;
    body;
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.body = body;
    }
}
export function getApiUrl() {
    const raw = process.env.DVY_API_URL ?? "https://preview.drovyu.com";
    const url = new URL(raw);
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp)
        throw new Error("DVY_API_URL must use HTTPS (HTTP is allowed only for localhost)");
    if (url.username || url.password || url.search || url.hash)
        throw new Error("DVY_API_URL must not contain credentials, a query, or a fragment");
    return url.toString().replace(/\/+$/, "");
}
async function requestHeaders(extra = {}) {
    const support = await getSupportStore();
    return {
        "x-dvy-device-id": await getDeviceId(),
        ...(support ? { "x-dvy-device-token": support.deviceToken } : {}),
        ...extra
    };
}
async function supportHeaders(deviceToken, extra = {}) {
    return {
        "x-dvy-device-id": await getDeviceId(),
        "x-dvy-device-token": deviceToken,
        ...extra
    };
}
async function parseResponse(response) {
    const text = await response.text();
    if (!response.ok) {
        throw new ApiError(`Request failed with ${response.status}`, response.status, text);
    }
    return text ? JSON.parse(text) : undefined;
}
function isValidDate(value) {
    return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}
function validateCreatePreviewResponse(value) {
    if (!value || typeof value !== "object")
        throw new Error("Invalid preview API response");
    const response = value;
    if (typeof response.id !== "string" || !/^[0-9a-f]{24}$/i.test(response.id) ||
        typeof response.owner !== "string" || response.owner.length > 128 ||
        !isValidDate(response.expiresAt) || !isValidDate(response.createdAt) ||
        typeof response.uploadBase !== "string" || response.uploadBase.length > 512 ||
        typeof response.uploadId !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(response.uploadId))
        throw new Error("Invalid preview API response");
    return response;
}
export async function createPreview(apiUrl, body) {
    const response = await fetch(`${apiUrl}/api/previews`, {
        method: "POST",
        headers: await requestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(body)
    });
    return validateCreatePreviewResponse(await parseResponse(response));
}
export async function updatePreview(apiUrl, id, body) {
    const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: await requestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(body)
    });
    return validateCreatePreviewResponse(await parseResponse(response));
}
export async function uploadFile(apiUrl, id, uploadId, storageKey, encrypted) {
    const body = encrypted.byteOffset === 0 && encrypted.byteLength === encrypted.buffer.byteLength
        ? encrypted.buffer
        : encrypted.slice().buffer;
    const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}/uploads/${encodeURIComponent(uploadId)}/files/${encodeURIComponent(storageKey)}`, {
        method: "PUT",
        headers: await requestHeaders({
            "content-length": String(encrypted.byteLength),
            "content-type": "application/octet-stream"
        }),
        body
    });
    await parseResponse(response);
}
export async function uploadManifest(apiUrl, id, uploadId, manifest) {
    const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}/uploads/${encodeURIComponent(uploadId)}/manifest`, {
        method: "PUT",
        headers: await requestHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(manifest)
    });
    await parseResponse(response);
}
export async function cancelUpload(apiUrl, id, uploadId) {
    const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}/uploads/${encodeURIComponent(uploadId)}`, {
        method: "DELETE",
        headers: await requestHeaders()
    });
    await parseResponse(response);
}
export async function listRemotePreviews(apiUrl) {
    const response = await fetch(`${apiUrl}/api/previews`, { headers: await requestHeaders() });
    return parseResponse(response);
}
export async function deletePreview(apiUrl, id) {
    const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: await requestHeaders()
    });
    await parseResponse(response);
}
export async function deleteAllPreviews(apiUrl) {
    const response = await fetch(`${apiUrl}/api/previews`, {
        method: "DELETE",
        headers: await requestHeaders()
    });
    await parseResponse(response);
}
export async function getUsage(apiUrl) {
    const response = await fetch(`${apiUrl}/api/usage`, { headers: await requestHeaders() });
    return parseResponse(response);
}
export async function createSupportClaim(apiUrl, deviceToken, recoveryTokenHash) {
    const response = await fetch(`${apiUrl}/api/support/claims`, {
        method: "POST",
        headers: await supportHeaders(deviceToken, { "content-type": "application/json" }),
        body: JSON.stringify({ recoveryTokenHash })
    });
    return parseResponse(response);
}
export async function getSupportStatus(apiUrl, deviceToken) {
    const response = await fetch(`${apiUrl}/api/support/status`, { headers: await supportHeaders(deviceToken) });
    return parseResponse(response);
}
export async function startSupportRecovery(apiUrl, deviceToken, email) {
    const response = await fetch(`${apiUrl}/api/support/recovery`, {
        method: "POST",
        headers: await supportHeaders(deviceToken, { "content-type": "application/json" }),
        body: JSON.stringify({ email })
    });
    return parseResponse(response);
}
export async function linkSupportDevice(apiUrl, deviceToken, recoveryTokenHash) {
    const response = await fetch(`${apiUrl}/api/support/link`, {
        method: "POST",
        headers: await supportHeaders(deviceToken, { "content-type": "application/json" }),
        body: JSON.stringify({ recoveryTokenHash })
    });
    return parseResponse(response);
}
export async function unlinkSupportDevice(apiUrl, deviceToken) {
    const response = await fetch(`${apiUrl}/api/support/device`, {
        method: "DELETE",
        headers: await supportHeaders(deviceToken)
    });
    await parseResponse(response);
}
