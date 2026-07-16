import type { EncryptedManifest, PreviewRecord } from "../shared.js";
import { getDeviceId, getSupportStore } from "./store.js";

export type CreatePreviewResponse = {
  id: string;
  owner: string;
  expiresAt: string;
  createdAt: string;
  previewUrl?: string;
  uploadBase: string;
  uploadId: string;
};

export type UsageResponse = {
  owner: string;
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  activePreviews: number;
  activePreviewLimit: number | null;
  supporter: boolean;
  supporterExpiresAt?: string;
};

export type SupportStatusResponse = {
  active: boolean;
  pending: boolean;
  expiresAt?: string;
  claimExpiresAt?: string;
  deviceCount?: number;
  maxDevices: number;
  benefits: {
    quotaBytes: number;
    unlimitedPreviews: boolean;
    customTtl: boolean;
    permanence: boolean;
  };
};

export type SupportClaimResponse = {
  claimCode: string;
  expiresAt: string;
  kofiUrl: string;
};

export type SupportRecoveryResponse = {
  accepted: true;
  message: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
  }
}

export function getApiUrl(): string {
  const raw = process.env.DVY_API_URL ?? "https://preview.drovyu.com";
  const url = new URL(raw);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new Error("DVY_API_URL must use HTTPS (HTTP is allowed only for localhost)");
  if (url.username || url.password || url.search || url.hash) throw new Error("DVY_API_URL must not contain credentials, a query, or a fragment");
  return url.toString().replace(/\/+$/, "");
}

async function requestHeaders(extra: HeadersInit = {}): Promise<HeadersInit> {
  const support = await getSupportStore();
  return {
    "x-dvy-device-id": await getDeviceId(),
    ...(support ? { "x-dvy-device-token": support.deviceToken } : {}),
    ...extra
  };
}

async function supportHeaders(deviceToken: string, extra: HeadersInit = {}): Promise<HeadersInit> {
  return {
    "x-dvy-device-id": await getDeviceId(),
    "x-dvy-device-token": deviceToken,
    ...extra
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(`Request failed with ${response.status}`, response.status, text);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function validateCreatePreviewResponse(value: unknown): CreatePreviewResponse {
  if (!value || typeof value !== "object") throw new Error("Invalid preview API response");
  const response = value as Partial<CreatePreviewResponse>;
  if (
    typeof response.id !== "string" || !/^[0-9a-f]{24}$/i.test(response.id) ||
    typeof response.owner !== "string" || response.owner.length > 128 ||
    !isValidDate(response.expiresAt) || !isValidDate(response.createdAt) ||
    typeof response.uploadBase !== "string" || response.uploadBase.length > 512 ||
    typeof response.uploadId !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(response.uploadId)
  ) throw new Error("Invalid preview API response");
  if (response.previewUrl !== undefined) {
    if (typeof response.previewUrl !== "string" || response.previewUrl.length > 512) throw new Error("Invalid preview API response");
    const previewUrl = new URL(response.previewUrl);
    const localHttp = previewUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(previewUrl.hostname);
    if ((previewUrl.protocol !== "https:" && !localHttp) || previewUrl.username || previewUrl.password || previewUrl.search || previewUrl.hash) {
      throw new Error("Invalid preview API response");
    }
  }
  return response as CreatePreviewResponse;
}

export async function createPreview(apiUrl: string, body: {
  totalSize: number;
  encryptedSize: number;
  fileCount: number;
  files: Array<{ storageKey: string; encryptedSize: number }>;
  commentAuthKey?: string | undefined;
  commentsEnabled?: boolean | undefined;
  ttlSeconds?: number | undefined;
  permanence?: boolean | undefined;
}): Promise<CreatePreviewResponse> {
  const response = await fetch(`${apiUrl}/api/previews`, {
    method: "POST",
    headers: await requestHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body)
  });
  return validateCreatePreviewResponse(await parseResponse<unknown>(response));
}

export async function updatePreview(apiUrl: string, id: string, body: {
  totalSize: number;
  encryptedSize: number;
  fileCount: number;
  files: Array<{ storageKey: string; encryptedSize: number }>;
  commentAuthKey?: string | undefined;
  commentsEnabled?: boolean | undefined;
  ttlSeconds?: number | undefined;
  permanence?: boolean | undefined;
}): Promise<CreatePreviewResponse> {
  const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: await requestHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body)
  });
  return validateCreatePreviewResponse(await parseResponse<unknown>(response));
}

export async function uploadFile(apiUrl: string, id: string, uploadId: string, storageKey: string, encrypted: Uint8Array): Promise<void> {
  const body = encrypted.byteOffset === 0 && encrypted.byteLength === encrypted.buffer.byteLength
    ? encrypted.buffer as ArrayBuffer
    : encrypted.slice().buffer as ArrayBuffer;
  const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}/uploads/${encodeURIComponent(uploadId)}/files/${encodeURIComponent(storageKey)}`, {
    method: "PUT",
    headers: await requestHeaders({
      "content-length": String(encrypted.byteLength),
      "content-type": "application/octet-stream"
    }),
    body
  });
  await parseResponse<void>(response);
}

export async function uploadManifest(apiUrl: string, id: string, uploadId: string, manifest: EncryptedManifest): Promise<void> {
  const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}/uploads/${encodeURIComponent(uploadId)}/manifest`, {
    method: "PUT",
    headers: await requestHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(manifest)
  });
  await parseResponse<void>(response);
}

export async function cancelUpload(apiUrl: string, id: string, uploadId: string): Promise<void> {
  const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}/uploads/${encodeURIComponent(uploadId)}`, {
    method: "DELETE",
    headers: await requestHeaders()
  });
  await parseResponse<void>(response);
}

export async function listRemotePreviews(apiUrl: string): Promise<PreviewRecord[]> {
  const response = await fetch(`${apiUrl}/api/previews`, { headers: await requestHeaders() });
  return parseResponse<PreviewRecord[]>(response);
}

export async function deletePreview(apiUrl: string, id: string): Promise<void> {
  const response = await fetch(`${apiUrl}/api/previews/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await requestHeaders()
  });
  await parseResponse<void>(response);
}

export async function deleteAllPreviews(apiUrl: string): Promise<void> {
  const response = await fetch(`${apiUrl}/api/previews`, {
    method: "DELETE",
    headers: await requestHeaders()
  });
  await parseResponse<void>(response);
}

export async function getUsage(apiUrl: string): Promise<UsageResponse> {
  const response = await fetch(`${apiUrl}/api/usage`, { headers: await requestHeaders() });
  return parseResponse<UsageResponse>(response);
}

export async function createSupportClaim(apiUrl: string, deviceToken: string, recoveryTokenHash: string): Promise<SupportClaimResponse> {
  const response = await fetch(`${apiUrl}/api/support/claims`, {
    method: "POST",
    headers: await supportHeaders(deviceToken, { "content-type": "application/json" }),
    body: JSON.stringify({ recoveryTokenHash })
  });
  return parseResponse<SupportClaimResponse>(response);
}

export async function getSupportStatus(apiUrl: string, deviceToken: string): Promise<SupportStatusResponse> {
  const response = await fetch(`${apiUrl}/api/support/status`, { headers: await supportHeaders(deviceToken) });
  return parseResponse<SupportStatusResponse>(response);
}

export async function startSupportRecovery(apiUrl: string, deviceToken: string, email: string): Promise<SupportRecoveryResponse> {
  const response = await fetch(`${apiUrl}/api/support/recovery`, {
    method: "POST",
    headers: await supportHeaders(deviceToken, { "content-type": "application/json" }),
    body: JSON.stringify({ email })
  });
  return parseResponse<SupportRecoveryResponse>(response);
}

export async function linkSupportDevice(apiUrl: string, deviceToken: string, recoveryTokenHash: string): Promise<SupportStatusResponse> {
  const response = await fetch(`${apiUrl}/api/support/link`, {
    method: "POST",
    headers: await supportHeaders(deviceToken, { "content-type": "application/json" }),
    body: JSON.stringify({ recoveryTokenHash })
  });
  return parseResponse<SupportStatusResponse>(response);
}

export async function unlinkSupportDevice(apiUrl: string, deviceToken: string): Promise<void> {
  const response = await fetch(`${apiUrl}/api/support/device`, {
    method: "DELETE",
    headers: await supportHeaders(deviceToken)
  });
  await parseResponse<void>(response);
}
