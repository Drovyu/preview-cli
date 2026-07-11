import { base64UrlEncode } from "../shared.js";

export type EncryptedFile = {
  key: CryptoKey;
  keyString: string;
};

export async function generatePreviewKey(): Promise<EncryptedFile> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  return { key, keyString: base64UrlEncode(raw) };
}

export async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<{ encrypted: Uint8Array; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const input = copy.buffer as ArrayBuffer;
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, input));
  return { encrypted, iv: base64UrlEncode(iv) };
}

export async function hashSecret(value: string): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
