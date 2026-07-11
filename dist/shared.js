export const ALLOWED_EXTENSIONS = new Set([
    ".html",
    ".htm",
    ".md",
    ".txt",
    ".json",
    ".xml",
    ".map",
    ".css",
    ".js",
    ".mjs",
    ".cjs",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".ico",
    ".avif",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".mp4",
    ".webm",
    ".mp3",
    ".wav",
    ".pdf"
]);
export function base64UrlEncode(bytes) {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export function base64UrlDecode(value) {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}
export function normalizePreviewPath(input) {
    return input.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}
export function isActive(record, now = new Date()) {
    return record.status === "active" && new Date(record.expires_at).getTime() > now.getTime();
}
