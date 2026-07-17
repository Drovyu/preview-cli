const config = window.__DVYU_COMMENTS_CONFIG__;
if (config && !window.__dvyCommentsLoaded && !window.__dvyCommentsLoading) {
    window.__dvyCommentsLoading = true;
    void startCommentsWithRetry(config).finally(() => { window.__dvyCommentsLoading = false; });
}
async function startCommentsWithRetry(configValue) {
    for (let attempt = 0; attempt < 4 && !window.__dvyCommentsLoaded; attempt += 1) {
        if (document.getElementById("dvyu-comments")) {
            window.__dvyCommentsLoaded = true;
            return;
        }
        if (await startComments(configValue)) {
            window.__dvyCommentsLoaded = true;
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
}
function base64UrlEncode(bytes) {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function base64UrlDecode(value) {
    const base = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
    return bytes;
}
async function getPreviewKey(configValue) {
    if (configValue.outer) {
        const key = new URLSearchParams(location.hash.slice(1)).get("k");
        if (key && /^[A-Za-z0-9_-]{43}$/.test(key))
            return { key, root: true };
        throw new Error("プレビューキーが見つかりません");
    }
    return new Promise((resolve, reject) => {
        const requestKey = () => window.parent.postMessage({ type: "DVY_COMMENT_REQUEST_KEY", id: configValue.previewId }, "*");
        const requestInterval = window.setInterval(requestKey, 250);
        const timeout = window.setTimeout(() => {
            clearInterval(requestInterval);
            window.removeEventListener("message", onMessage);
            reject(new Error("プレビューキーを取得できませんでした"));
        }, 3000);
        function onMessage(event) {
            if (event.origin !== location.origin || event.data?.type !== "DVY_COMMENT_KEY" || event.data?.id !== configValue.previewId)
                return;
            if (typeof event.data.key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(event.data.key))
                return;
            clearTimeout(timeout);
            clearInterval(requestInterval);
            window.removeEventListener("message", onMessage);
            resolve({ key: event.data.key, root: event.data.root === true });
        }
        window.addEventListener("message", onMessage);
        requestKey();
    });
}
async function commentToken(keyString) {
    const value = new TextEncoder().encode(`dvyu-comment-auth-v1:${keyString}`);
    return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", value)));
}
async function importKey(keyString) {
    return crypto.subtle.importKey("raw", Uint8Array.from(base64UrlDecode(keyString)).buffer, "AES-GCM", false, ["encrypt", "decrypt"]);
}
function currentRoute(configValue) {
    if (configValue.outer)
        return "expired";
    const route = new URL(location.href);
    route.searchParams.delete("__dvy_sw_retry");
    return `${route.pathname}${route.search}${route.hash}`;
}
function startRouteSync(configValue) {
    const send = () => window.parent.postMessage({ type: "DVY_COMMENT_ROUTE", id: configValue.previewId, route: currentRoute(configValue) }, "*");
    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);
    history.pushState = (data, unused, url) => {
        pushState(data, unused, url);
        queueMicrotask(send);
    };
    history.replaceState = (data, unused, url) => {
        replaceState(data, unused, url);
        queueMicrotask(send);
    };
    addEventListener("popstate", send);
    addEventListener("hashchange", send);
    send();
}
function randomId() {
    return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}
function storedNotificationClientId() {
    const storageKey = "dvyu-notification-client-id";
    try {
        const existing = localStorage.getItem(storageKey) || "";
        if (/^[A-Za-z0-9_-]{22}$/.test(existing))
            return existing;
    }
    catch { }
    const created = randomId();
    try {
        localStorage.setItem(storageKey, created);
    }
    catch { }
    return created;
}
function outerNotificationClientId(previewId) {
    return new Promise((resolve) => {
        const fallback = randomId();
        const timeout = window.setTimeout(() => {
            window.removeEventListener("message", receive);
            resolve(fallback);
        }, 1500);
        function receive(event) {
            if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "DVY_NOTIFICATION_CLIENT" || event.data?.id !== previewId)
                return;
            if (typeof event.data.clientId !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(event.data.clientId))
                return;
            clearTimeout(timeout);
            window.removeEventListener("message", receive);
            resolve(event.data.clientId);
        }
        window.addEventListener("message", receive);
        window.parent.postMessage({ type: "DVY_NOTIFICATION_CLIENT_GET", id: previewId }, location.origin);
    });
}
function cssEscape(value) {
    return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/[^A-Za-z0-9_-]/g, "\\$&");
}
function selectorFor(element) {
    if (!element || element === document.documentElement || element === document.body)
        return null;
    if (element.id)
        return `#${cssEscape(element.id)}`;
    const testId = element.getAttribute("data-testid");
    if (testId)
        return `[data-testid="${testId.replaceAll('"', '\\"')}"]`;
    const parts = [];
    let current = element;
    while (current && current !== document.body && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
            if (siblings.length > 1)
                part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
    }
    return parts.length ? parts.join(" > ") : null;
}
function quoteFor(element) {
    const text = element?.textContent?.replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 240) : null;
}
async function startComments(configValue) {
    let keyResult;
    try {
        keyResult = await getPreviewKey(configValue);
    }
    catch {
        return false;
    }
    if (!keyResult.root)
        return false;
    const keyString = keyResult.key;
    if (!configValue.outer)
        startRouteSync(configValue);
    const [cryptoKey, token] = await Promise.all([importKey(keyString), commentToken(keyString)]);
    const host = document.createElement("div");
    host.id = "dvyu-comments";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
    <style>
      :host{all:initial;--dvy-blue:#007aff;--dvy-blue-hover:#006ee6;--dvy-material:rgba(250,250,252,.88);--dvy-material-solid:#f7f7f9;--dvy-fill:rgba(118,118,128,.12);--dvy-fill-hover:rgba(118,118,128,.2);--dvy-border:rgba(60,60,67,.2);--dvy-text:#1d1d1f;--dvy-secondary:#6e6e73;--dvy-danger:#ff3b30}
      *{box-sizing:border-box;letter-spacing:0}
      button,textarea{font:inherit}
      .launcher{position:fixed;right:20px;bottom:20px;z-index:2147483647;width:38px;height:38px;border:0;border-radius:8px;background:var(--dvy-blue);color:#fff;box-shadow:0 4px 14px rgba(0,122,255,.3),0 1px 3px rgba(0,0,0,.16);display:grid;place-items:center;cursor:pointer;transition:background .15s ease,transform .15s ease}
      .launcher:hover{background:var(--dvy-blue-hover)}.launcher:active{transform:scale(.96)}.launcher:focus-visible,.menu button:focus-visible,.toolbar button:focus-visible,.composer button:focus-visible,.panel button:focus-visible{outline:3px solid rgba(0,122,255,.35);outline-offset:2px}
      .launcher svg{width:21px;height:21px}
      .launcher-count{position:absolute;right:-7px;top:-7px;min-width:18px;height:18px;padding:0 5px;border:2px solid #fff;border-radius:9px;background:#ff3b30;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);font:700 10px/14px -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;text-align:center;white-space:nowrap}.launcher-count[hidden]{display:none}
      .menu{position:fixed;right:20px;bottom:66px;z-index:2147483647;width:188px;padding:6px;border:1px solid var(--dvy-border);border-radius:8px;background:var(--dvy-material);color:var(--dvy-text);box-shadow:0 12px 34px rgba(0,0,0,.18);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);font:14px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif}
      .menu[hidden],.workspace[hidden],.composer[hidden],.panel[hidden],.pins[hidden]{display:none}
      .menu button{width:100%;min-height:38px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:9px}.menu button:hover{background:var(--dvy-fill-hover)}.menu button svg{flex:0 0 auto;width:17px;height:17px;color:var(--dvy-secondary)}
      .workspace{position:fixed;inset:0;z-index:2147483646;font:14px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;color:var(--dvy-text)}
      .toolbar{position:absolute;left:0;right:0;top:0;height:44px;display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--dvy-material);border-bottom:1px solid var(--dvy-border);box-shadow:0 2px 12px rgba(0,0,0,.12);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px)}
      .toolbar-title{flex:1;text-align:center;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.toolbar button{height:32px;min-width:32px;padding:0 8px;border:0;border-radius:7px;background:transparent;color:var(--dvy-text);cursor:pointer;display:grid;place-items:center}.toolbar button:hover{background:var(--dvy-fill-hover)}.toolbar button svg{width:18px;height:18px}.toolbar .trash{color:var(--dvy-danger)}.toolbar .send{display:block;min-width:72px;background:var(--dvy-blue);color:#fff;font-weight:600}.toolbar .send:hover{background:var(--dvy-blue-hover)}.toolbar .send:disabled{opacity:.45;cursor:not-allowed}
      .capture{position:absolute;inset:44px 0 0;cursor:crosshair;background:rgba(0,122,255,.025);touch-action:none;user-select:none}
      .selection,.draft-region{position:absolute;border:2px solid var(--dvy-blue);background:rgba(0,122,255,.1);pointer-events:none}.selection:after{content:"";position:absolute;right:-8px;bottom:-8px;width:14px;height:14px;border:2px solid #fff;border-radius:50%;background:var(--dvy-blue);box-shadow:0 1px 4px rgba(0,0,0,.25)}
      .drafts{position:absolute;inset:44px 0 0;z-index:2;pointer-events:none}.draft-pin{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;border:2px solid #fff;border-radius:50%;background:var(--dvy-blue);color:#fff;box-shadow:0 2px 9px rgba(0,122,255,.35);display:grid;place-items:center;font-weight:700}.draft-label{position:absolute;max-width:min(280px,calc(100vw - 48px));padding:7px 10px;border:1px solid var(--dvy-border);border-radius:8px;background:var(--dvy-material);color:var(--dvy-text);box-shadow:0 5px 18px rgba(0,0,0,.16);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .workspace.external-toolbar .toolbar{display:none}.workspace.external-toolbar .capture,.workspace.external-toolbar .drafts{inset:0}
      .composer{position:fixed;z-index:2147483647;width:min(360px,calc(100vw - 24px));padding:10px;border:1px solid var(--dvy-border);border-radius:8px;background:var(--dvy-material);color:var(--dvy-text);box-shadow:0 14px 38px rgba(0,0,0,.2);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px)}
      .composer textarea{display:block;width:100%;min-height:88px;max-height:180px;resize:vertical;padding:10px;border:1px solid var(--dvy-border);border-radius:8px;background:var(--dvy-material-solid);color:var(--dvy-text);line-height:1.5;outline:none}.composer textarea:focus{border-color:var(--dvy-blue);box-shadow:0 0 0 3px rgba(0,122,255,.18)}.composer-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}.composer button{height:34px;padding:0 12px;border:0;border-radius:8px;cursor:pointer}.composer .cancel{background:var(--dvy-fill);color:var(--dvy-text)}.composer .add{background:var(--dvy-blue);color:#fff;font-weight:600}
      .name-dialog{position:fixed;right:20px;bottom:66px;z-index:2147483647;width:min(300px,calc(100vw - 24px));padding:12px;border:1px solid var(--dvy-border);border-radius:8px;background:var(--dvy-material);color:var(--dvy-text);box-shadow:0 14px 36px rgba(0,0,0,.22);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);font:13px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif}.name-dialog[hidden]{display:none}.name-title{margin-bottom:8px;font-weight:600}.name-dialog input{width:100%;height:36px;padding:0 10px;border:1px solid var(--dvy-border);border-radius:8px;background:var(--dvy-material-solid);color:var(--dvy-text);outline:none}.name-dialog input:focus{border-color:var(--dvy-blue);box-shadow:0 0 0 3px rgba(0,122,255,.18)}.name-hint{margin-top:6px;color:var(--dvy-secondary);font-size:11px}.name-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.name-actions button{height:32px;padding:0 11px;border:0;border-radius:8px;background:var(--dvy-fill);color:var(--dvy-text);cursor:pointer}.name-actions .save-name{background:var(--dvy-blue);color:#fff;font-weight:600}
      .pins{position:fixed;inset:0;z-index:2147483645;pointer-events:none;font:12px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif}.pin{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;border:2px solid #fff;border-radius:50%;background:var(--dvy-blue);color:#fff;box-shadow:0 2px 9px rgba(0,122,255,.35);display:grid;place-items:center;pointer-events:auto;cursor:pointer;font-weight:700}.region{position:absolute;border:2px solid var(--dvy-blue);background:rgba(0,122,255,.08);pointer-events:none}
      .panel{position:fixed;top:12px;right:12px;bottom:66px;z-index:2147483646;width:min(380px,calc(100vw - 24px));display:flex;flex-direction:column;border:1px solid var(--dvy-border);border-radius:8px;background:var(--dvy-material);color:var(--dvy-text);box-shadow:0 18px 44px rgba(0,0,0,.22);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif}.panel-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dvy-border)}.panel-title{flex:1;font-weight:600}.panel button{width:32px;height:32px;padding:0;border:0;border-radius:7px;background:var(--dvy-fill);color:var(--dvy-text);cursor:pointer;display:grid;place-items:center}.panel button:hover{background:var(--dvy-fill-hover)}.panel button svg{width:17px;height:17px}.comments{overflow:auto;padding:8px}.comment{padding:10px 4px;border-bottom:1px solid var(--dvy-border);cursor:pointer;transition:background .15s ease}.comment:hover,.comment:focus-visible{background:rgba(0,122,255,.07);outline:0}.comment.is-active{background:rgba(0,122,255,.1)}.comment:last-child{border-bottom:0}.comment-meta{margin-bottom:4px;color:var(--dvy-secondary);font-size:12px}.comment-text{white-space:pre-wrap;overflow-wrap:anywhere}.empty{padding:28px 12px;color:var(--dvy-secondary);text-align:center}.error{padding:10px;color:#b42318;background:rgba(255,59,48,.12);border-radius:8px}
      .comment-replies{margin:9px 0 0 16px;padding-left:10px;border-left:2px solid rgba(0,122,255,.22)}.comment-reply{padding:7px 0}.comment-reply+.comment-reply{border-top:1px solid var(--dvy-border)}
      .comment-popover{position:fixed;z-index:2147483647;width:min(250px,calc(100vw - 24px));padding:10px 12px;border:0;border-radius:8px;background:#0a84ff;color:#fff;box-shadow:0 8px 24px rgba(0,86,184,.3),0 2px 6px rgba(0,0,0,.18);font:12px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif}.comment-popover[hidden]{display:none}.popover-header{display:none}.popover-body{display:flex;align-items:flex-start;gap:9px}.popover-avatar{flex:0 0 auto;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.22);display:grid;place-items:center;font-size:11px;font-weight:600}.popover-content{min-width:0;flex:1}.popover-author-row{display:flex;align-items:baseline;gap:6px;margin-bottom:2px;white-space:nowrap}.popover-author{font-weight:650}.popover-meta{min-width:0;color:rgba(255,255,255,.78);font-size:11px;overflow:hidden;text-overflow:ellipsis}.popover-text{white-space:pre-wrap;overflow-wrap:anywhere;font-weight:500}
      .comment-popover.is-expanded{width:min(360px,calc(100vw - 24px));padding:0;background:#2c2c2e;color:#f5f5f7;box-shadow:0 14px 36px rgba(0,0,0,.38)}.comment-popover.is-expanded .popover-header{height:40px;display:flex;align-items:center;gap:8px;padding:0 10px 0 12px;border-bottom:1px solid rgba(235,235,245,.14);font-weight:600}.popover-header-title{flex:1}.popover-close{width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:#f5f5f7;display:grid;place-items:center;cursor:pointer}.popover-close:hover{background:rgba(118,118,128,.3)}.popover-close svg{width:15px;height:15px}.comment-popover.is-expanded .popover-body{padding:12px}.comment-popover.is-expanded .popover-avatar{width:26px;height:26px;background:#636366}.comment-popover.is-expanded .popover-meta{color:#aeaeb2}.popover-replies,.reply-composer{display:none}.comment-popover.is-expanded .popover-replies{display:block;max-height:170px;overflow:auto;padding:0 12px 4px;border-top:1px solid rgba(235,235,245,.12)}.popover-reply{display:flex;gap:8px;padding:10px 0;border-bottom:1px solid rgba(235,235,245,.1)}.popover-reply:last-child{border-bottom:0}.reply-avatar{flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:#636366;display:grid;place-items:center;font-size:10px}.reply-content{min-width:0;flex:1}.reply-meta{margin-bottom:2px;color:#aeaeb2;font-size:11px}.reply-text{white-space:pre-wrap;overflow-wrap:anywhere}.comment-popover.is-expanded .reply-composer{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid rgba(235,235,245,.14)}.reply-composer textarea{min-width:0;flex:1;min-height:36px;max-height:90px;padding:8px 10px;border:1px solid rgba(235,235,245,.16);border-radius:8px;background:rgba(118,118,128,.2);color:#fff;resize:none;outline:none;font:13px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif}.reply-composer textarea:focus{border-color:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.2)}.reply-send{flex:0 0 auto;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:#0a84ff;color:#fff;display:grid;place-items:center;cursor:pointer}.reply-send:disabled{background:#636366;color:#aeaeb2;cursor:not-allowed}.reply-send svg{width:16px;height:16px}
      @media(prefers-color-scheme:dark){:host{--dvy-material:rgba(38,38,41,.88);--dvy-material-solid:#1c1c1e;--dvy-fill:rgba(118,118,128,.24);--dvy-fill-hover:rgba(118,118,128,.34);--dvy-border:rgba(235,235,245,.18);--dvy-text:#f5f5f7;--dvy-secondary:#aeaeb2}}
      @media(max-width:520px){.launcher{right:12px;bottom:12px}.menu,.name-dialog{right:12px;bottom:56px}.toolbar{padding:8px}.toolbar-title{text-align:left}.toolbar .trash{display:none}.panel{bottom:56px}}
    </style>
    <button class="launcher" type="button" title="コメント" aria-label="コメント"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M8 12h8"/><path d="M12 8v8"/></svg><span class="launcher-count" aria-hidden="true" hidden></span></button>
    <div class="menu" hidden><button type="button" data-action="add"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M8 12h8"/><path d="M12 8v8"/></svg><span>コメントを追加</span></button><button type="button" data-action="show"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/></svg><span>コメントを表示</span></button><button type="button" data-action="name"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg><span>表示名を設定</span></button><button type="button" data-action="notifications"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg><span>通知を設定</span></button></div>
    <div class="workspace" hidden>
      <div class="toolbar"><button type="button" data-action="close" aria-label="閉じる" title="閉じる"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button><button class="trash" type="button" data-action="clear" aria-label="下書きを削除" title="下書きを削除"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button><div class="toolbar-title">コメントを追加</div><button class="send" type="button" data-action="send" disabled>送信 0</button></div>
      <div class="capture"><div class="selection" hidden></div></div>
      <div class="drafts" aria-live="polite"></div>
    </div>
    <div class="composer" hidden><textarea maxlength="4000" placeholder="コメントを追加…" aria-label="コメント"></textarea><div class="composer-actions"><button class="cancel" type="button" data-action="cancel-draft">キャンセル</button><button class="add" type="button" data-action="stage">追加</button></div></div>
    <div class="name-dialog" role="dialog" aria-modal="true" aria-label="表示名を設定" hidden><div class="name-title">表示名を設定</div><input type="text" maxlength="40" autocomplete="nickname" placeholder="匿名" aria-label="表示名"><div class="name-hint">コメントと一緒に暗号化されます。空欄の場合は匿名です。</div><div class="name-actions"><button type="button" data-action="cancel-name">キャンセル</button><button class="save-name" type="button" data-action="save-name">保存</button></div></div>
    <div class="pins" hidden></div>
    <aside class="panel" hidden><div class="panel-head"><div class="panel-title">コメント一覧</div><button type="button" data-action="hide-panel" aria-label="一覧を隠す" title="一覧を隠す"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/></svg></button><button type="button" data-action="refresh" aria-label="更新" title="更新"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></button><button type="button" data-action="close-panel" aria-label="閉じる" title="閉じる"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div><div class="comments"></div></aside>
    <div class="comment-popover" role="tooltip" hidden><div class="popover-header"><div class="popover-header-title">コメント</div><button class="popover-close" type="button" aria-label="閉じる" title="閉じる"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div><div class="popover-body"><div class="popover-avatar"></div><div class="popover-content"><div class="popover-author-row"><span class="popover-author"></span><span class="popover-meta"></span></div><div class="popover-text"></div></div></div><div class="popover-replies"></div><div class="reply-composer"><textarea maxlength="4000" rows="1" placeholder="返信を入力…" aria-label="返信"></textarea><button class="reply-send" type="button" aria-label="返信を送信" title="返信を送信" disabled><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg></button></div></div>
  `;
    document.documentElement.append(host);
    const launcher = root.querySelector(".launcher");
    const launcherCount = root.querySelector(".launcher-count");
    const menu = root.querySelector(".menu");
    const workspace = root.querySelector(".workspace");
    const capture = root.querySelector(".capture");
    const selection = root.querySelector(".selection");
    const draftsLayer = root.querySelector(".drafts");
    const composer = root.querySelector(".composer");
    const textarea = root.querySelector("textarea");
    const nameDialog = root.querySelector(".name-dialog");
    const nameInput = nameDialog.querySelector("input");
    const sendButton = root.querySelector('[data-action="send"]');
    const pins = root.querySelector(".pins");
    const panel = root.querySelector(".panel");
    const commentsContainer = root.querySelector(".comments");
    const commentPopover = root.querySelector(".comment-popover");
    const popoverAvatar = root.querySelector(".popover-avatar");
    const popoverAuthor = root.querySelector(".popover-author");
    const popoverMeta = root.querySelector(".popover-meta");
    const popoverText = root.querySelector(".popover-text");
    const popoverReplies = root.querySelector(".popover-replies");
    const replyInput = root.querySelector(".reply-composer textarea");
    const replySend = root.querySelector(".reply-send");
    const drafts = [];
    const renderedAnchors = [];
    let pendingAnchor = null;
    let dragStart = null;
    let activeCommentItem = null;
    let activeCommentPin = null;
    let popoverLocked = false;
    let popoverHideTimer = 0;
    let activeRootComment = null;
    const displayNameStorageKey = "dvyu-comment-display-name";
    let displayName = "匿名";
    const usesOuterToolbar = !configValue.outer && window.parent !== window;
    const notificationClientIdPromise = usesOuterToolbar
        ? outerNotificationClientId(configValue.previewId)
        : Promise.resolve(storedNotificationClientId());
    const toolbarOffset = usesOuterToolbar ? 0 : 44;
    if (usesOuterToolbar)
        workspace.classList.add("external-toolbar");
    if (configValue.expired)
        root.querySelector('[data-action="add"]').hidden = true;
    function updateCommentCount(count) {
        const normalized = Math.max(0, Math.floor(count));
        launcherCount.hidden = normalized === 0;
        launcherCount.textContent = normalized > 999 ? "999+" : String(normalized);
        const label = normalized === 0 ? "コメント" : `コメント（${normalized.toLocaleString()}件）`;
        launcher.setAttribute("aria-label", label);
        launcher.title = label;
    }
    async function refreshCommentCount() {
        try {
            const response = await fetch(configValue.apiPath, { headers: { "x-dvy-comment-token": token } });
            if (!response.ok)
                return;
            const page = await response.json();
            if (Number.isFinite(page.count))
                updateCommentCount(Number(page.count));
        }
        catch {
            // A count failure must not prevent the preview from rendering.
        }
    }
    function normalizeDisplayName(value) {
        return (value || "").trim().slice(0, 40) || "匿名";
    }
    function getDisplayName() {
        return displayName;
    }
    function saveDisplayName(value) {
        const normalized = normalizeDisplayName(value);
        displayName = normalized;
        if (usesOuterToolbar) {
            window.parent.postMessage({ type: "DVY_COMMENT_NAME_SET", id: configValue.previewId, name: normalized === "匿名" ? "" : normalized }, location.origin);
            return;
        }
        try {
            if (normalized === "匿名")
                localStorage.removeItem(displayNameStorageKey);
            else
                localStorage.setItem(displayNameStorageKey, normalized);
        }
        catch {
            // The name still applies to this comment when storage is unavailable.
        }
    }
    if (usesOuterToolbar) {
        window.parent.postMessage({ type: "DVY_COMMENT_NAME_GET", id: configValue.previewId }, location.origin);
    }
    else {
        try {
            displayName = normalizeDisplayName(localStorage.getItem(displayNameStorageKey));
        }
        catch { }
    }
    function updateSendButton() {
        sendButton.textContent = `送信 ${drafts.length}`;
        sendButton.disabled = drafts.length === 0;
        if (usesOuterToolbar)
            window.parent.postMessage({ type: "DVY_COMMENT_DRAFTS", id: configValue.previewId, count: drafts.length }, location.origin);
    }
    function resolveAnchorRect(anchor, route) {
        if (!configValue.outer && route !== currentRoute(configValue))
            return null;
        if (anchor.selector) {
            try {
                const element = document.querySelector(anchor.selector);
                if (element) {
                    const rect = element.getBoundingClientRect();
                    if (anchor.type === "point" && typeof anchor.targetX === "number" && typeof anchor.targetY === "number") {
                        return { left: rect.left + rect.width * anchor.targetX - 10, top: rect.top + rect.height * anchor.targetY - 10, width: 20, height: 20 };
                    }
                    if (anchor.type === "region") {
                        if (typeof anchor.targetX === "number" && typeof anchor.targetY === "number" && typeof anchor.targetWidth === "number" && typeof anchor.targetHeight === "number") {
                            return {
                                left: rect.left + rect.width * anchor.targetX,
                                top: rect.top + rect.height * anchor.targetY,
                                width: rect.width * anchor.targetWidth,
                                height: rect.height * anchor.targetHeight
                            };
                        }
                        // Older region comments did not store offsets within the selected element.
                        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
                    }
                }
            }
            catch {
                // Fall back to normalized coordinates when the page structure changed.
            }
        }
        if (typeof anchor.pageX === "number" && typeof anchor.pageY === "number" && typeof anchor.pageWidth === "number" && typeof anchor.pageHeight === "number") {
            const documentWidth = Math.max(document.documentElement.scrollWidth, innerWidth);
            const documentHeight = Math.max(document.documentElement.scrollHeight, innerHeight);
            return {
                left: anchor.pageX * documentWidth - scrollX,
                top: anchor.pageY * documentHeight - scrollY,
                width: anchor.pageWidth * documentWidth,
                height: anchor.pageHeight * documentHeight
            };
        }
        return {
            left: anchor.x * innerWidth - scrollX,
            top: anchor.y * innerHeight - scrollY,
            width: anchor.width * innerWidth,
            height: anchor.height * innerHeight
        };
    }
    function positionCommentAnchors() {
        for (const rendered of renderedAnchors) {
            const rect = anchorRect(rendered.comment);
            const visible = Boolean(rect);
            rendered.pin.hidden = !visible;
            if (rendered.region)
                rendered.region.hidden = !visible;
            if (!rect)
                continue;
            if (rendered.region)
                Object.assign(rendered.region.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
            Object.assign(rendered.pin.style, { left: `${rect.left + rect.width}px`, top: `${rect.top + rect.height}px` });
        }
    }
    function renderDrafts() {
        draftsLayer.replaceChildren();
        const occupiedLabels = [];
        drafts.forEach((draft, index) => {
            const rect = resolveAnchorRect(draft.payload.anchor, draft.payload.route);
            if (!rect)
                return;
            if (draft.payload.anchor.type === "region") {
                const region = document.createElement("div");
                region.className = "draft-region";
                Object.assign(region.style, { left: `${rect.left}px`, top: `${rect.top - toolbarOffset}px`, width: `${rect.width}px`, height: `${rect.height}px` });
                draftsLayer.append(region);
            }
            const pin = document.createElement("div");
            pin.className = "draft-pin";
            pin.textContent = String(index + 1);
            Object.assign(pin.style, { left: `${rect.left + rect.width}px`, top: `${rect.top + rect.height - toolbarOffset}px` });
            const label = document.createElement("div");
            label.className = "draft-label";
            label.textContent = `${index + 1}. ${draft.payload.text}`;
            draftsLayer.append(pin, label);
            const labelLeft = Math.max(12, Math.min(Math.max(12, innerWidth - 292), rect.left + rect.width + 18));
            label.style.left = `${labelLeft}px`;
            let labelTop = Math.max(4, rect.top + rect.height + 10 - toolbarOffset);
            label.style.top = `${labelTop}px`;
            let labelRect = label.getBoundingClientRect();
            if (labelRect.bottom > innerHeight - 12) {
                labelTop = Math.max(4, rect.top - labelRect.height - 10 - toolbarOffset);
                label.style.top = `${labelTop}px`;
                labelRect = label.getBoundingClientRect();
            }
            let attempts = 0;
            while (occupiedLabels.some((item) => labelRect.left < item.right + 6 && labelRect.right + 6 > item.left && labelRect.top < item.bottom + 6 && labelRect.bottom + 6 > item.top) && attempts < drafts.length) {
                labelTop += labelRect.height + 6;
                if (labelTop + toolbarOffset + labelRect.height > innerHeight - 12)
                    labelTop = Math.max(4, labelTop - (labelRect.height + 6) * 2);
                label.style.top = `${labelTop}px`;
                labelRect = label.getBoundingClientRect();
                attempts += 1;
            }
            occupiedLabels.push({ left: labelRect.left, top: labelRect.top, right: labelRect.right, bottom: labelRect.bottom });
        });
    }
    let positionFrame = 0;
    function scheduleAnchorPosition() {
        if (positionFrame)
            return;
        positionFrame = requestAnimationFrame(() => {
            positionFrame = 0;
            renderDrafts();
            positionCommentAnchors();
            closeCommentPopover();
        });
    }
    addEventListener("resize", scheduleAnchorPosition);
    addEventListener("scroll", scheduleAnchorPosition, true);
    function closeComposer() {
        composer.hidden = true;
        textarea.value = "";
        pendingAnchor = null;
        selection.hidden = true;
    }
    function exitAddMode() {
        closeComposer();
        workspace.hidden = true;
        if (usesOuterToolbar)
            window.parent.postMessage({ type: "DVY_COMMENT_MODE", id: configValue.previewId, active: false }, location.origin);
    }
    function clearDrafts() {
        drafts.length = 0;
        updateSendButton();
        renderDrafts();
        closeComposer();
    }
    function closeCommentPopover() {
        clearTimeout(popoverHideTimer);
        commentPopover.hidden = true;
        commentPopover.classList.remove("is-expanded");
        activeCommentItem?.classList.remove("is-active");
        activeCommentItem = null;
        activeCommentPin = null;
        activeRootComment = null;
        popoverLocked = false;
        replyInput.value = "";
        replySend.disabled = true;
    }
    function formatRelativeTime(value) {
        const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
        if (elapsed < 60_000)
            return "たった今";
        if (elapsed < 3_600_000)
            return `${Math.floor(elapsed / 60_000)}分前`;
        if (elapsed < 86_400_000)
            return `${Math.floor(elapsed / 3_600_000)}時間前`;
        if (elapsed < 2_592_000_000)
            return `${Math.floor(elapsed / 86_400_000)}日前`;
        return new Date(value).toLocaleDateString();
    }
    function schedulePopoverClose() {
        clearTimeout(popoverHideTimer);
        if (popoverLocked)
            return;
        popoverHideTimer = window.setTimeout(closeCommentPopover, 120);
    }
    function showCommentPopover(comment, replies, index, pin, item, expanded) {
        clearTimeout(popoverHideTimer);
        if (activeCommentPin === pin && !commentPopover.hidden) {
            if (expanded && popoverLocked) {
                closeCommentPopover();
                return;
            }
            if (expanded) {
                popoverLocked = true;
                commentPopover.classList.add("is-expanded");
            }
        }
        else {
            closeCommentPopover();
            activeCommentItem = item;
            activeCommentPin = pin;
            activeRootComment = comment;
            popoverLocked = expanded;
            item.classList.add("is-active");
            popoverAvatar.textContent = String(index + 1);
            popoverAuthor.textContent = normalizeDisplayName(comment.payload.authorName);
            popoverMeta.textContent = formatRelativeTime(comment.createdAt);
            popoverText.textContent = comment.payload.text;
            popoverReplies.replaceChildren();
            replies.forEach((reply) => {
                const row = document.createElement("div");
                row.className = "popover-reply";
                const avatar = document.createElement("div");
                avatar.className = "reply-avatar";
                const replyName = normalizeDisplayName(reply.payload.authorName);
                avatar.textContent = replyName === "匿名" ? "?" : replyName.slice(0, 1).toUpperCase();
                const content = document.createElement("div");
                content.className = "reply-content";
                const meta = document.createElement("div");
                meta.className = "reply-meta";
                meta.textContent = `${replyName} · ${formatRelativeTime(reply.createdAt)}`;
                const text = document.createElement("div");
                text.className = "reply-text";
                text.textContent = reply.payload.text;
                content.append(meta, text);
                row.append(avatar, content);
                popoverReplies.append(row);
            });
            commentPopover.classList.toggle("is-expanded", expanded);
            commentPopover.hidden = false;
        }
        const pinRect = pin.getBoundingClientRect();
        const popoverRect = commentPopover.getBoundingClientRect();
        let left = pinRect.right + 10;
        if (left + popoverRect.width > innerWidth - 12)
            left = pinRect.left - popoverRect.width - 10;
        left = Math.max(12, Math.min(innerWidth - popoverRect.width - 12, left));
        const top = Math.max(12, Math.min(innerHeight - popoverRect.height - 12, pinRect.top - 8));
        Object.assign(commentPopover.style, { left: `${left}px`, top: `${top}px` });
        item.scrollIntoView({ block: "nearest" });
    }
    launcher.addEventListener("click", () => { nameDialog.hidden = true; menu.hidden = !menu.hidden; });
    root.querySelector('[data-action="add"]').addEventListener("click", () => {
        menu.hidden = true;
        panel.hidden = true;
        pins.hidden = true;
        closeCommentPopover();
        workspace.hidden = false;
        renderDrafts();
        updateSendButton();
        if (usesOuterToolbar)
            window.parent.postMessage({ type: "DVY_COMMENT_MODE", id: configValue.previewId, active: true }, location.origin);
    });
    root.querySelector('[data-action="show"]').addEventListener("click", () => {
        menu.hidden = true;
        workspace.hidden = true;
        void showComments();
    });
    root.querySelector('[data-action="name"]').addEventListener("click", () => {
        menu.hidden = true;
        nameInput.value = getDisplayName() === "匿名" ? "" : getDisplayName();
        nameDialog.hidden = false;
        nameInput.focus();
    });
    root.querySelector('[data-action="notifications"]').addEventListener("click", async () => {
        menu.hidden = true;
        let previewUrl = location.href;
        try {
            if (window.top?.location.href)
                previewUrl = window.top.location.href;
        }
        catch { }
        const setupUrl = new URL("https://notify.dvyu.link/");
        setupUrl.hash = new URLSearchParams({ preview: configValue.previewId, url: previewUrl, client: await notificationClientIdPromise }).toString();
        window.open(setupUrl, "_blank", "noopener,noreferrer");
    });
    root.querySelector('[data-action="cancel-name"]').addEventListener("click", () => { nameDialog.hidden = true; });
    root.querySelector('[data-action="save-name"]').addEventListener("click", () => {
        saveDisplayName(nameInput.value);
        nameDialog.hidden = true;
    });
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveDisplayName(nameInput.value);
            nameDialog.hidden = true;
        }
    });
    replyInput.addEventListener("input", () => { replySend.disabled = !replyInput.value.trim(); });
    replyInput.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !replySend.disabled) {
            event.preventDefault();
            replySend.click();
        }
    });
    replySend.addEventListener("click", async () => {
        const text = replyInput.value.trim();
        const parent = activeRootComment;
        if (!text || !parent)
            return;
        const parentId = parent.commentId;
        replySend.disabled = true;
        replyInput.disabled = true;
        try {
            await postEncryptedComments([{
                    commentId: randomId(),
                    payload: {
                        version: 1,
                        text,
                        route: parent.payload.route,
                        anchor: parent.payload.anchor,
                        createdAt: new Date().toISOString(),
                        authorName: getDisplayName(),
                        parentId
                    }
                }]);
            replyInput.value = "";
            await showComments(parentId);
        }
        catch (error) {
            replyInput.title = error instanceof Error ? error.message : "返信を送信できませんでした";
            replyInput.style.borderColor = "#ff453a";
        }
        finally {
            replyInput.disabled = false;
            replySend.disabled = !replyInput.value.trim();
        }
    });
    replyInput.addEventListener("focus", () => { replyInput.style.borderColor = ""; replyInput.title = ""; });
    root.querySelector('[data-action="close"]').addEventListener("click", exitAddMode);
    root.querySelector('[data-action="clear"]').addEventListener("click", clearDrafts);
    root.querySelector('[data-action="cancel-draft"]').addEventListener("click", closeComposer);
    root.querySelector('[data-action="close-panel"]').addEventListener("click", () => { panel.hidden = true; pins.hidden = true; closeCommentPopover(); });
    root.querySelector('[data-action="hide-panel"]').addEventListener("click", () => { panel.hidden = true; closeCommentPopover(); });
    root.querySelector('[data-action="refresh"]').addEventListener("click", () => void showComments());
    root.querySelector(".popover-close").addEventListener("click", closeCommentPopover);
    commentPopover.addEventListener("pointerenter", () => clearTimeout(popoverHideTimer));
    commentPopover.addEventListener("pointerleave", schedulePopoverClose);
    root.addEventListener("click", (event) => {
        const target = event.target;
        if (popoverLocked && !commentPopover.contains(target) && !target.closest(".pin"))
            closeCommentPopover();
    });
    addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeCommentPopover();
            nameDialog.hidden = true;
        }
    });
    if (usesOuterToolbar) {
        addEventListener("message", (event) => {
            if (event.origin !== location.origin || event.source !== window.parent || event.data?.id !== configValue.previewId)
                return;
            if (event.data.type === "DVY_COMMENT_NAME") {
                displayName = normalizeDisplayName(typeof event.data.name === "string" ? event.data.name : "");
                if (!nameDialog.hidden)
                    nameInput.value = displayName === "匿名" ? "" : displayName;
                return;
            }
            if (event.data.type !== "DVY_COMMENT_COMMAND")
                return;
            if (event.data.command === "close")
                exitAddMode();
            if (event.data.command === "clear")
                clearDrafts();
            if (event.data.command === "send")
                sendButton.click();
        });
    }
    capture.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !composer.hidden)
            return;
        dragStart = { x: event.clientX, y: event.clientY };
        capture.setPointerCapture(event.pointerId);
        selection.hidden = false;
        Object.assign(selection.style, { left: `${event.clientX}px`, top: `${event.clientY - toolbarOffset}px`, width: "1px", height: "1px" });
    });
    capture.addEventListener("pointermove", (event) => {
        if (!dragStart)
            return;
        const left = Math.min(dragStart.x, event.clientX);
        const top = Math.min(dragStart.y, event.clientY);
        Object.assign(selection.style, {
            left: `${left}px`, top: `${top - toolbarOffset}px`,
            width: `${Math.max(1, Math.abs(event.clientX - dragStart.x))}px`,
            height: `${Math.max(1, Math.abs(event.clientY - dragStart.y))}px`
        });
    });
    capture.addEventListener("pointerup", (event) => {
        if (!dragStart)
            return;
        const distance = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y);
        const type = distance < 8 ? "point" : "region";
        const width = type === "point" ? 20 : Math.max(8, Math.abs(event.clientX - dragStart.x));
        const height = type === "point" ? 20 : Math.max(8, Math.abs(event.clientY - dragStart.y));
        const x = type === "point" ? event.clientX - 10 : Math.min(dragStart.x, event.clientX);
        const y = type === "point" ? event.clientY - 10 : Math.min(dragStart.y, event.clientY);
        host.style.display = "none";
        const underlying = document.elementFromPoint(x + width / 2, y + height / 2);
        host.style.display = "";
        const underlyingRect = underlying?.getBoundingClientRect();
        const documentWidth = Math.max(document.documentElement.scrollWidth, innerWidth);
        const documentHeight = Math.max(document.documentElement.scrollHeight, innerHeight);
        pendingAnchor = {
            type, x: x / innerWidth, y: y / innerHeight, width: width / innerWidth, height: height / innerHeight,
            pageX: (x + scrollX) / documentWidth,
            pageY: (y + scrollY) / documentHeight,
            pageWidth: width / documentWidth,
            pageHeight: height / documentHeight,
            viewportWidth: innerWidth, viewportHeight: innerHeight,
            selector: type === "point" ? selectorFor(underlying) : null,
            quote: quoteFor(underlying),
            ...(underlyingRect?.width && underlyingRect.height ? type === "point" ? {
                targetX: Math.max(0, Math.min(1, (x + width / 2 - underlyingRect.left) / underlyingRect.width)),
                targetY: Math.max(0, Math.min(1, (y + height / 2 - underlyingRect.top) / underlyingRect.height))
            } : {
                targetX: (x - underlyingRect.left) / underlyingRect.width,
                targetY: (y - underlyingRect.top) / underlyingRect.height,
                targetWidth: width / underlyingRect.width,
                targetHeight: height / underlyingRect.height
            } : {})
        };
        dragStart = null;
        const composerLeft = Math.min(innerWidth - Math.min(360, innerWidth - 24) - 12, Math.max(12, x + width + 12));
        const composerTop = Math.min(innerHeight - 160, Math.max(70, y));
        Object.assign(composer.style, { left: `${composerLeft}px`, top: `${composerTop}px` });
        composer.hidden = false;
        textarea.focus();
    });
    root.querySelector('[data-action="stage"]').addEventListener("click", () => {
        const text = textarea.value.trim();
        if (!text || !pendingAnchor || drafts.length >= 25)
            return;
        drafts.push({
            commentId: randomId(),
            payload: { version: 1, text, route: currentRoute(configValue), anchor: pendingAnchor, createdAt: new Date().toISOString(), authorName: getDisplayName() }
        });
        updateSendButton();
        renderDrafts();
        closeComposer();
    });
    async function postEncryptedComments(entries) {
        const encrypted = await Promise.all(entries.map(async (entry) => {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const aad = new TextEncoder().encode(`dvyu-comment-v1:${configValue.previewId}:${entry.commentId}`);
            const plaintext = new TextEncoder().encode(JSON.stringify(entry.payload));
            const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, cryptoKey, plaintext));
            return { commentId: entry.commentId, iv: base64UrlEncode(iv), ciphertext: base64UrlEncode(ciphertext) };
        }));
        const response = await fetch(configValue.apiPath, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-dvy-comment-token": token,
                "x-dvy-notification-client": await notificationClientIdPromise
            },
            body: JSON.stringify({ comments: encrypted })
        });
        if (!response.ok)
            throw new Error(`コメントを送信できませんでした (${response.status})`);
        const result = await response.json();
        if (Number.isFinite(result.count))
            updateCommentCount(Number(result.count));
    }
    sendButton.addEventListener("click", async () => {
        if (!drafts.length)
            return;
        sendButton.disabled = true;
        sendButton.textContent = "送信中…";
        if (usesOuterToolbar)
            window.parent.postMessage({ type: "DVY_COMMENT_DRAFTS", id: configValue.previewId, count: drafts.length, sending: true }, location.origin);
        try {
            await postEncryptedComments(drafts);
            drafts.length = 0;
            updateSendButton();
            renderDrafts();
            exitAddMode();
            await showComments();
        }
        catch (error) {
            sendButton.disabled = false;
            sendButton.textContent = `再送信 ${drafts.length}`;
            if (usesOuterToolbar)
                window.parent.postMessage({ type: "DVY_COMMENT_DRAFTS", id: configValue.previewId, count: drafts.length }, location.origin);
            commentsContainer.innerHTML = `<div class="error"></div>`;
            commentsContainer.querySelector(".error").textContent = error instanceof Error ? error.message : "コメントを送信できませんでした";
        }
    });
    async function decryptComment(comment) {
        try {
            const aad = new TextEncoder().encode(`dvyu-comment-v1:${configValue.previewId}:${comment.commentId}`);
            const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Uint8Array.from(base64UrlDecode(comment.iv)).buffer, additionalData: aad }, cryptoKey, Uint8Array.from(base64UrlDecode(comment.ciphertext)).buffer);
            const payload = JSON.parse(new TextDecoder().decode(plaintext));
            return payload.version === 1 && typeof payload.text === "string" ? { ...comment, payload } : null;
        }
        catch {
            return null;
        }
    }
    async function loadComments() {
        const encrypted = [];
        let cursor = null;
        do {
            const url = new URL(configValue.apiPath, location.origin);
            if (cursor)
                url.searchParams.set("cursor", cursor);
            const response = await fetch(url, { headers: { "x-dvy-comment-token": token } });
            if (!response.ok)
                throw new Error(`コメントを取得できませんでした (${response.status})`);
            const page = await response.json();
            if (Number.isFinite(page.count))
                updateCommentCount(Number(page.count));
            encrypted.push(...page.comments);
            cursor = page.nextCursor;
        } while (cursor && encrypted.length < 10_000);
        return (await Promise.all(encrypted.map(decryptComment))).filter((comment) => comment !== null);
    }
    function anchorRect(comment) {
        return resolveAnchorRect(comment.payload.anchor, comment.payload.route);
    }
    const focusStorageKey = `dvyu-comment-focus:${configValue.previewId}`;
    function focusComment(comment, replies, index, pin, item) {
        const rect = anchorRect(comment);
        if (!rect)
            return;
        scrollBy({
            left: rect.left + rect.width / 2 - innerWidth / 2,
            top: rect.top + rect.height / 2 - innerHeight / 2,
            behavior: "smooth"
        });
        window.setTimeout(() => {
            positionCommentAnchors();
            item.scrollIntoView({ block: "nearest" });
            showCommentPopover(comment, replies, index, pin, item, true);
        }, 350);
    }
    function navigateToComment(comment, replies, index, pin, item) {
        if (configValue.outer)
            return;
        let target;
        try {
            target = new URL(comment.payload.route, location.href);
        }
        catch {
            return;
        }
        if (target.origin !== location.origin)
            return;
        target.searchParams.delete("__dvy_sw_retry");
        const targetRoute = `${target.pathname}${target.search}${target.hash}`;
        if (targetRoute === currentRoute(configValue) && pin) {
            focusComment(comment, replies, index, pin, item);
            return;
        }
        try {
            sessionStorage.setItem(focusStorageKey, comment.commentId);
        }
        catch { }
        location.assign(targetRoute);
    }
    async function showComments(reopenCommentId) {
        closeCommentPopover();
        panel.hidden = false;
        pins.hidden = false;
        commentsContainer.innerHTML = `<div class="empty">読み込んでいます…</div>`;
        pins.replaceChildren();
        renderedAnchors.length = 0;
        try {
            const comments = await loadComments();
            commentsContainer.replaceChildren();
            if (!comments.length)
                commentsContainer.innerHTML = `<div class="empty">コメントはありません</div>`;
            const ids = new Set(comments.map((comment) => comment.commentId));
            const roots = comments.filter((comment) => !comment.payload.parentId || !ids.has(comment.payload.parentId));
            const repliesByParent = new Map();
            comments.forEach((comment) => {
                if (!comment.payload.parentId || !ids.has(comment.payload.parentId))
                    return;
                const replies = repliesByParent.get(comment.payload.parentId) || [];
                replies.push(comment);
                repliesByParent.set(comment.payload.parentId, replies);
            });
            let reopenTarget = null;
            roots.forEach((comment, index) => {
                const replies = repliesByParent.get(comment.commentId) || [];
                const item = document.createElement("article");
                item.className = "comment";
                item.tabIndex = 0;
                item.setAttribute("role", "button");
                item.setAttribute("aria-label", `${index + 1}番のコメント位置へ移動`);
                const meta = document.createElement("div");
                meta.className = "comment-meta";
                meta.textContent = `${index + 1} · ${normalizeDisplayName(comment.payload.authorName)} · ${new Date(comment.createdAt).toLocaleString()}`;
                const body = document.createElement("div");
                body.className = "comment-text";
                body.textContent = comment.payload.text;
                item.append(meta, body);
                if (replies.length) {
                    const replyList = document.createElement("div");
                    replyList.className = "comment-replies";
                    replies.forEach((reply) => {
                        const replyItem = document.createElement("div");
                        replyItem.className = "comment-reply";
                        const replyMeta = document.createElement("div");
                        replyMeta.className = "comment-meta";
                        replyMeta.textContent = `${normalizeDisplayName(reply.payload.authorName)} · ${new Date(reply.createdAt).toLocaleString()}`;
                        const replyText = document.createElement("div");
                        replyText.className = "comment-text";
                        replyText.textContent = reply.payload.text;
                        replyItem.append(replyMeta, replyText);
                        replyList.append(replyItem);
                    });
                    item.append(replyList);
                }
                commentsContainer.append(item);
                const rect = anchorRect(comment);
                if (!rect || configValue.outer) {
                    item.addEventListener("click", () => navigateToComment(comment, replies, index, null, item));
                    item.addEventListener("keydown", (event) => {
                        if (event.key !== "Enter" && event.key !== " ")
                            return;
                        event.preventDefault();
                        navigateToComment(comment, replies, index, null, item);
                    });
                    return;
                }
                let region;
                if (comment.payload.anchor.type === "region") {
                    region = document.createElement("div");
                    region.className = "region";
                    pins.append(region);
                }
                const pin = document.createElement("button");
                pin.type = "button";
                pin.className = "pin";
                pin.textContent = String(index + 1);
                pin.title = comment.payload.text.slice(0, 120);
                pin.addEventListener("pointerenter", () => showCommentPopover(comment, replies, index, pin, item, false));
                pin.addEventListener("pointerleave", schedulePopoverClose);
                pin.addEventListener("focus", () => showCommentPopover(comment, replies, index, pin, item, false));
                pin.addEventListener("blur", schedulePopoverClose);
                pin.addEventListener("click", (event) => {
                    event.stopPropagation();
                    showCommentPopover(comment, replies, index, pin, item, true);
                });
                pins.append(pin);
                renderedAnchors.push({ comment, pin, ...(region ? { region } : {}) });
                item.addEventListener("click", () => navigateToComment(comment, replies, index, pin, item));
                item.addEventListener("keydown", (event) => {
                    if (event.key !== "Enter" && event.key !== " ")
                        return;
                    event.preventDefault();
                    navigateToComment(comment, replies, index, pin, item);
                });
                if (comment.commentId === reopenCommentId)
                    reopenTarget = { comment, replies, index, pin, item };
            });
            positionCommentAnchors();
            if (reopenCommentId) {
                try {
                    sessionStorage.removeItem(focusStorageKey);
                }
                catch { }
            }
            if (reopenTarget) {
                const target = reopenTarget;
                focusComment(target.comment, target.replies, target.index, target.pin, target.item);
            }
        }
        catch (error) {
            commentsContainer.innerHTML = `<div class="error"></div>`;
            commentsContainer.querySelector(".error").textContent = error instanceof Error ? error.message : "コメントを取得できませんでした";
        }
    }
    let pendingFocusCommentId = "";
    try {
        pendingFocusCommentId = sessionStorage.getItem(focusStorageKey) || "";
    }
    catch { }
    if (configValue.expired || pendingFocusCommentId)
        void showComments(pendingFocusCommentId || undefined);
    else
        void refreshCommentCount();
    return true;
}
export {};
