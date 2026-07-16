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

export type EncryptionMetadata = {
  alg: "AES-GCM";
  iv: string;
};

export type ManifestFile = {
  path: string;
  storageKey: string;
  mime: string;
  size: number;
  encryptedSize: number;
  encryption: EncryptionMetadata;
};

export type EncryptedManifest = {
  version: 1;
  encryption: EncryptionMetadata;
  ciphertext: string;
};

export type PreviewManifest = {
  version: 1;
  id: string;
  entrypoint: string;
  files: ManifestFile[];
};

export type PreviewRecord = {
  id: string;
  owner: string;
  supporter_id?: string | null;
  comment_auth_key?: string | null;
  comments_expires_at?: string | null;
  comments_enabled?: number;
  pending_comments_enabled?: number | null;
  total_size: number;
  expires_at: string;
  created_at: string;
  last_accessed_at?: string | null;
  retention_mode?: "temporary" | "permanent";
  status: "pending" | "active" | "deleted" | "expired";
  entrypoint: string;
  encrypted_size?: number;
  expected_file_count?: number;
  active_generation?: string | null;
  pending_generation?: string | null;
  stale_generation?: string | null;
  pending_total_size?: number | null;
  pending_encrypted_size?: number;
  pending_expected_file_count?: number | null;
};

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function normalizePreviewPath(input: string): string {
  return input.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

export function isActive(record: Pick<PreviewRecord, "status" | "expires_at">, now = new Date()): boolean {
  return record.status === "active" && new Date(record.expires_at).getTime() > now.getTime();
}
