function previewUrl(previewId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open("dvyu-notifications", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("previews");
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      const get = database.transaction("previews").objectStore("previews").get(previewId);
      get.onsuccess = () => { resolve(typeof get.result === "string" ? get.result : null); database.close(); };
      get.onerror = () => { resolve(null); database.close(); };
    };
  });
}

type WorkerPushEvent = Event & {
  data?: { json(): unknown };
  waitUntil(promise: Promise<unknown>): void;
};

type WorkerNotificationEvent = Event & {
  notification: { close(): void; data?: unknown };
  waitUntil(promise: Promise<unknown>): void;
};

type WorkerWindowClient = { url: string; focus(): Promise<unknown> };

const worker = globalThis as unknown as {
  registration: { showNotification(title: string, options: NotificationOptions): Promise<void> };
  clients: {
    matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<WorkerWindowClient[]>;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(type: string, listener: (event: Event) => void): void;
};

worker.addEventListener("push", (event) => {
  const pushEvent = event as WorkerPushEvent;
  let payload: { previewId?: string; count?: number } = {};
  try { payload = pushEvent.data?.json() as typeof payload || {}; } catch {}
  if (!payload.previewId || !/^[0-9a-f]{24}$/.test(payload.previewId)) return;
  const count = Math.max(1, Math.min(25, Math.floor(Number(payload.count) || 1)));
  pushEvent.waitUntil(worker.registration.showNotification("Drovyu Preview", {
    body: `新しいコメントが${count.toLocaleString()}件あります。`,
    tag: `dvyu-comments-${payload.previewId}`,
    data: { previewId: payload.previewId }
  }));
});

worker.addEventListener("notificationclick", (event) => {
  const notificationEvent = event as WorkerNotificationEvent;
  notificationEvent.notification.close();
  const data = notificationEvent.notification.data as { previewId?: unknown } | undefined;
  const previewId = String(data?.previewId || "");
  notificationEvent.waitUntil((async () => {
    const url = await previewUrl(previewId);
    const clientList = await worker.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientList.find((client) => url && client.url === url);
    if (existing) return existing.focus();
    return worker.clients.openWindow(url || "https://cli.drovyu.com/");
  })());
});

export {};
