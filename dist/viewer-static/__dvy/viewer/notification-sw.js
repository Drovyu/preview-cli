function previewUrl(previewId) {
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
const worker = globalThis;
worker.addEventListener("push", (event) => {
    const pushEvent = event;
    let payload = {};
    try {
        payload = pushEvent.data?.json() || {};
    }
    catch { }
    if (!payload.previewId || !/^[0-9a-f]{24}$/.test(payload.previewId))
        return;
    const count = Math.max(1, Math.min(25, Math.floor(Number(payload.count) || 1)));
    pushEvent.waitUntil(worker.registration.showNotification("Drovyu Preview", {
        body: `新しいコメントが${count.toLocaleString()}件あります。`,
        tag: `dvyu-comments-${payload.previewId}`,
        data: { previewId: payload.previewId }
    }));
});
worker.addEventListener("notificationclick", (event) => {
    const notificationEvent = event;
    notificationEvent.notification.close();
    const data = notificationEvent.notification.data;
    const previewId = String(data?.previewId || "");
    notificationEvent.waitUntil((async () => {
        const url = await previewUrl(previewId);
        const clientList = await worker.clients.matchAll({ type: "window", includeUncontrolled: true });
        const existing = clientList.find((client) => url && client.url === url);
        if (existing)
            return existing.focus();
        return worker.clients.openWindow(url || "https://cli.drovyu.com/");
    })());
});
export {};
