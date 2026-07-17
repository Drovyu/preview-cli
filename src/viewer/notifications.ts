declare global {
  interface Window { __DVYU_NOTIFY__?: { vapidPublicKey: string; previewDomain: string } }
}

const config = window.__DVYU_NOTIFY__;
const previewIdElement = document.getElementById("preview-id")!;
const enableButton = document.getElementById("enable") as HTMLButtonElement;
const disableButton = document.getElementById("disable") as HTMLButtonElement;
const statusElement = document.getElementById("status")!;

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function commentToken(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`dvyu-comment-auth-v1:${key}`));
  return base64UrlEncode(new Uint8Array(digest));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("dvyu-notifications", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("previews");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storePreviewUrl(previewId: string, url: string | null): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("previews", "readwrite");
    if (url) transaction.objectStore("previews").put(url, previewId);
    else transaction.objectStore("previews").delete(previewId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function setStatus(message: string, error = false): void {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

async function start(): Promise<void> {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const previewId = fragment.get("preview") || "";
  const previewUrlValue = fragment.get("url") || "";
  const clientId = fragment.get("client") || "";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("このブラウザは通知設定に対応していません。");
  }
  if (!/^[0-9a-f]{24}$/.test(previewId) || !/^[A-Za-z0-9_-]{22}$/.test(clientId) || !config?.vapidPublicKey || !config.previewDomain) throw new Error("通知設定リンクが正しくありません。");
  const previewUrl = new URL(previewUrlValue);
  const key = new URLSearchParams(previewUrl.hash.slice(1)).get("k") || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(key) || previewUrl.hostname !== `${previewId}.${config.previewDomain}`) throw new Error("プレビューURLが正しくありません。");
  history.replaceState(null, "", location.pathname);
  previewIdElement.textContent = previewId;
  const token = await commentToken(key);
  const registration = await navigator.serviceWorker.register("/notification-sw.js", { scope: "/", type: "module" });
  await navigator.serviceWorker.ready;

  async function request(action: "status" | "subscribe" | "unsubscribe", subscription: PushSubscription): Promise<{ active: boolean }> {
    const response = await fetch("/api/notifications/subscription", {
      method: "POST",
      headers: { "content-type": "application/json", "x-dvy-comment-token": token },
      body: JSON.stringify({ action, previewId, clientId, subscription: subscription.toJSON() })
    });
    const body = await response.json() as { active?: boolean; error?: string };
    if (!response.ok) throw new Error(body.error || `通知設定に失敗しました (${response.status})`);
    return { active: body.active === true };
  }

  function render(active: boolean): void {
    enableButton.hidden = active;
    disableButton.hidden = !active;
    setStatus(active ? "このプレビューの通知は有効です。" : "通知は無効です。");
  }

  const current = await registration.pushManager.getSubscription();
  if (current) {
    const result = await request("status", current);
    if (result.active) await storePreviewUrl(previewId, previewUrl.href);
    render(result.active);
  } else {
    render(false);
  }

  enableButton.addEventListener("click", async () => {
    enableButton.disabled = true;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("ブラウザの通知が許可されませんでした。");
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlDecode(config.vapidPublicKey)
      });
      await request("subscribe", subscription);
      await storePreviewUrl(previewId, previewUrl.href);
      render(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "通知を有効にできませんでした。", true);
    } finally {
      enableButton.disabled = false;
    }
  });

  disableButton.addEventListener("click", async () => {
    disableButton.disabled = true;
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await request("unsubscribe", subscription);
      await storePreviewUrl(previewId, null);
      render(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "通知を解除できませんでした。", true);
    } finally {
      disableButton.disabled = false;
    }
  });
}

void start().catch((error) => {
  enableButton.disabled = true;
  setStatus(error instanceof Error ? error.message : "通知設定を読み込めませんでした。", true);
});

export {};
