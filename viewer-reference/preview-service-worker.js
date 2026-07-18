let dvyKey = null;
let dvyKeyRequest = null;
let resolveDvyKey = null;
let dvyKeyTimeout = null;
let dvyManifest = null;
let dvyPlainCacheBytes = 0;
const dvyPlainCache = new Map();
const dvyPlainCacheMaxBytes = 32 * 1024 * 1024;
const id = "000000000000000000000000";
const previewPrefix = "/_preview/";
const subdomainMode = true;
function b64u(value){const base=value.replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(value.length/4)*4,"=");const bin=atob(base);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;}
async function requestKey(){
  if(dvyKey) return dvyKey;
  if(!dvyKeyRequest){
    dvyKeyRequest = new Promise((resolve, reject) => {
      resolveDvyKey = resolve;
      dvyKeyTimeout = setTimeout(() => {
        if(!dvyKey){
          dvyKeyRequest = null;
          resolveDvyKey = null;
          reject(new Error("Missing preview key"));
        }
      }, 3000);
      self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients => {
        for(const client of clients) client.postMessage({type:"DVY_REQUEST_KEY",id});
        if(!clients.length){
          clearTimeout(dvyKeyTimeout);
          dvyKeyRequest = null;
          resolveDvyKey = null;
          reject(new Error("Missing preview client"));
        }
      }, error => {
        clearTimeout(dvyKeyTimeout);
        dvyKeyRequest = null;
        resolveDvyKey = null;
        reject(error);
      });
    });
  }
  return dvyKeyRequest;
}
async function key(){return crypto.subtle.importKey("raw",b64u(await requestKey()),"AES-GCM",false,["decrypt"]);}
async function manifest(){
  if(!dvyManifest){
    const encryptedManifest=await (await fetch("/__dvy/api/p/"+id+"/manifest")).json();
    const plain=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:b64u(encryptedManifest.encryption.iv)}, await key(), b64u(encryptedManifest.ciphertext)));
    dvyManifest=JSON.parse(new TextDecoder().decode(plain));
  }
  return dvyManifest;
}
function clearPlainCache(){
  dvyPlainCache.clear();
  dvyPlainCacheBytes = 0;
}
function trimPlainCache(){
  while(dvyPlainCacheBytes > dvyPlainCacheMaxBytes && dvyPlainCache.size){
    const oldestKey = dvyPlainCache.keys().next().value;
    const oldest = dvyPlainCache.get(oldestKey);
    dvyPlainCache.delete(oldestKey);
    dvyPlainCacheBytes -= oldest?.bytes || 0;
  }
}
async function decryptedFile(file){
  const cached = dvyPlainCache.get(file.storageKey);
  if(cached){
    dvyPlainCache.delete(file.storageKey);
    dvyPlainCache.set(file.storageKey, cached);
    return cached.promise;
  }
  const entry = {bytes:0,promise:null};
  entry.promise = (async () => {
    const encrypted = new Uint8Array(await (await fetch("/__dvy/api/p/"+id+"/file?key="+encodeURIComponent(file.storageKey))).arrayBuffer());
    const plain = new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:b64u(file.encryption.iv)}, await key(), encrypted));
    entry.bytes = plain.byteLength;
    dvyPlainCacheBytes += entry.bytes;
    trimPlainCache();
    return plain;
  })().catch(error => {
    if(dvyPlainCache.get(file.storageKey) === entry) dvyPlainCache.delete(file.storageKey);
    dvyPlainCacheBytes -= entry.bytes;
    throw error;
  });
  dvyPlainCache.set(file.storageKey, entry);
  return entry.promise;
}
function resolvePreviewPath(filePath, manifest){
  let path = filePath.replace(/^\/+/, "");
  try { path = decodeURIComponent(path); } catch {}
  const hasFile = candidate => manifest.files.some(f => f.path === candidate);
  if(!path) return manifest.entrypoint;
  if(hasFile(path)) return path;
  const clean = path.replace(/\/+$/, "");
  if(!clean) return manifest.entrypoint;
  const directoryIndex = clean + "/index.html";
  if(hasFile(directoryIndex)) return directoryIndex;
  const htmlFile = clean + ".html";
  if(hasFile(htmlFile)) return htmlFile;
  return null;
}
function resolvePreviewPathWithFallback(filePath, manifest){
  const direct = resolvePreviewPath(filePath, manifest);
  if(direct) return direct;
  const clean = filePath.replace(/^\/+/, "");
  const segments = clean.split("/");
  for(let i = 1; i < segments.length; i++){
    const resolved = resolvePreviewPath(segments.slice(i).join("/"), manifest);
    if(resolved) return resolved;
  }
  return null;
}
function pathFromUrl(url, manifest){
  const pathname = new URL(url).pathname;
  const previewPath = pathname.startsWith(previewPrefix) ? pathname.slice(previewPrefix.length) : pathname.replace(/^\/+/, "");
  return resolvePreviewPathWithFallback(previewPath, manifest);
}
function splitUrlParts(raw){
  const match = raw.match(/^([^?#]*)([?#].*)?$/);
  return match ? {path: match[1], suffix: match[2] || ""} : null;
}
function canRewriteUrl(raw){
  return raw && !raw.startsWith("//") && !raw.startsWith(previewPrefix) && !/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(raw);
}
function resolvePreviewReference(raw, basePath, manifest){
  if(!canRewriteUrl(raw)) return null;
  const parts = splitUrlParts(raw);
  if(!parts || !parts.path) return null;
  let filePath = parts.path;
  if(!filePath.startsWith("/")){
    const baseDir = basePath && basePath.includes("/") ? basePath.slice(0, basePath.lastIndexOf("/") + 1) : "";
    filePath = baseDir + filePath;
  }
  filePath = new URL(filePath, "https://dvy.invalid/").pathname.replace(/^\/+/, "");
  const resolved = resolvePreviewPathWithFallback(filePath, manifest);
  if(!resolved) return null;
  return {path: resolved, suffix: parts.suffix};
}
function rewritePreviewUrl(raw, manifest, basePath){
  const resolved = resolvePreviewReference(raw, basePath, manifest);
  return resolved ? previewPrefix+resolved.path+resolved.suffix : raw;
}
function rewritePreviewText(text, manifest, basePath){
  let out = text;
  out = out.replace(/((?:src|href|action|poster)=["'])([^"']*)/gi, (_, prefix, value) => prefix + rewritePreviewUrl(value, manifest, basePath));
  out = out.replace(/(url\(\s*['"]?)([^'")]+)(['"]?\s*\))/gi, (_, prefix, value, suffix) => prefix + rewritePreviewUrl(value.trim(), manifest, basePath) + suffix);
  out = out.replace(/([\`'"])(\.?\.?\/[^\`'"]+)([\`'"])/g, (full, quote, value, endQuote) => {
    const rewritten = rewritePreviewUrl(value, manifest, basePath);
    return rewritten === value ? full : quote + rewritten + endQuote;
  });
  return out;
}
function decryptErrorResponse(){
  const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>復号に失敗しました</title><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#f7f5fb;color:#1d1d1f;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.box{width:min(460px,calc(100vw - 32px));padding:22px 24px;border:1px solid rgba(162,89,255,.18);border-radius:14px;background:rgba(255,255,255,.84);box-shadow:0 18px 54px rgba(31,24,44,.08);text-align:center}.mark{display:inline-grid;place-items:center;width:42px;height:42px;margin-bottom:12px;border-radius:999px;background:rgba(143,29,44,.1);color:#8f1d2c;font-weight:700}.title{margin:0 0 8px;font-size:18px;font-weight:700}.text{margin:0;color:#6e6e73;font-size:13px;line-height:1.7}</style></head><body><main class="box"><div class="mark">!</div><h1 class="title">復号に失敗しました</h1><p class="text">URL のキーが正しいか、リンクが壊れていないか確認してください。</p></main></body></html>';
  return new Response(html, {status: 422, headers: {"content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store"}});
}
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("message", event => {
  if(event.data?.type==="DVY_KEY" && event.data.id===id && /^[A-Za-z0-9_-]{43}$/.test(event.data.key)){
    dvyManifest = null;
    clearPlainCache();
    dvyKey = event.data.key;
    clearTimeout(dvyKeyTimeout);
    dvyKeyTimeout = null;
    resolveDvyKey?.(dvyKey);
    resolveDvyKey = null;
    event.ports?.[0]?.postMessage({type:"DVY_READY"});
    event.source?.postMessage?.({type:"DVY_READY"});
  }
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if(url.origin !== location.origin) return;
  if(subdomainMode){
    const viewerDocument = url.pathname === "/" && event.request.destination === "document";
    if(viewerDocument || url.pathname === "/sw.js" || url.pathname.startsWith("/__dvy/") || url.pathname.startsWith("/cdn-cgi/")) return;
  } else if(!url.pathname.startsWith(previewPrefix)) return;
  event.respondWith((async () => {
    try {
      const m = await manifest();
      const filePath = pathFromUrl(event.request.url, m);
      const file = filePath ? m.files.find(f => f.path === filePath) : null;
      if(!file) return new Response("Not found", {status:404});
      const plain = await decryptedFile(file);
      const isText = file.mime.startsWith("text/") || file.mime === "application/javascript";
      const contentType = isText && !/;\s*charset=/i.test(file.mime) ? file.mime + "; charset=utf-8" : file.mime;
      const headers = new Headers({"content-type": contentType, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow"});
      if(file.mime.startsWith("text/html")){
        let html = rewritePreviewText(new TextDecoder().decode(plain), m, filePath);
        const additions = "<script>window.__DVYU_COMMENTS_CONFIG__={\"previewId\":\"000000000000000000000000\",\"apiPath\":\"/__dvy/api/p/000000000000000000000000/comments\",\"outer\":false,\"expired\":false};</script><script type=\"module\" src=\"/__dvy/viewer/comments.js?v=21\"></script>" + "<script>(()=>{if(window.__dvyBadge)return;window.__dvyBadge=1;const host=document.createElement(\"div\");const root=host.attachShadow({mode:\"closed\"});root.innerHTML=\"\\n<style>\\n@keyframes drovyuBadgeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}\\n.drovyu-preview-badge{position:fixed;right:64px;bottom:20px;z-index:2147483647;display:flex;align-items:center;gap:8px;font-family:Inter,-apple-system,BlinkMacSystemFont,\\\"Segoe UI\\\",sans-serif;animation:drovyuBadgeIn .45s ease both}\\n.drovyu-preview-badge a{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:34px;border-radius:999px;text-decoration:none;font-size:12px;line-height:1;white-space:nowrap;transition:transform .18s ease,background .18s ease,box-shadow .18s ease}\\n.drovyu-preview-badge a:hover{transform:translateY(-1px)}\\n.drovyu-preview-badge__credit{gap:7px;padding:0 12px 0 10px;background:rgba(20,20,22,.88);color:#fff;border:1px solid rgba(255,255,255,.08);box-shadow:0 4px 14px rgba(0,0,0,.14);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}\\n.drovyu-preview-badge__credit:hover{background:rgba(20,20,22,1)}\\n.drovyu-preview-badge__mark{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;overflow:hidden;flex:0 0 auto}\\n.drovyu-preview-badge__mark svg{display:block;width:15px;height:15px}\\n.drovyu-preview-badge__muted{opacity:.58;font-weight:400}\\n.drovyu-preview-badge__brand{font-weight:650}\\n.drovyu-preview-badge__support{gap:6px;padding:0 13px;background:#fff;color:#29abe0;border:1px solid rgba(0,0,0,.06);box-shadow:0 4px 14px rgba(0,0,0,.12);font-weight:650}\\n.drovyu-preview-badge__support:hover{box-shadow:0 6px 18px rgba(0,0,0,.16)}\\n.drovyu-preview-badge__cup{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#ff5e5b}\\n.drovyu-preview-badge__cup::before{content:\\\"\\\";display:block;width:9px;height:7px;border-radius:0 0 3px 3px;background:#fff}\\n@media(max-width:520px){.drovyu-preview-badge{right:56px;bottom:12px}.drovyu-preview-badge__support span:last-child{display:none}.drovyu-preview-badge__support{width:34px;padding:0}}\\n</style>\\n<div class=\\\"drovyu-preview-badge\\\" aria-label=\\\"Preview badge\\\">\\n  <a class=\\\"drovyu-preview-badge__credit\\\" href=\\\"https://drovyu.com\\\" target=\\\"_blank\\\" rel=\\\"noopener noreferrer\\\">\\n    <span class=\\\"drovyu-preview-badge__mark\\\" aria-hidden=\\\"true\\\"><svg xmlns=\\\"http://www.w3.org/2000/svg\\\" viewBox=\\\"0 0 346.87 334.82\\\" role=\\\"img\\\" aria-label=\\\"Drovyu\\\">\\n    <path fill=\\\"#fff\\\" d=\\\"M332.13,70.64l-50.04.04c-2.21,0-4.01-1.8-4-4.01l.12-50.71c0-3.57,4.34-5.34,6.85-2.8l49.92,50.67c2.49,2.53.7,6.8-2.85,6.81Z\\\"/>\\n    <path fill=\\\"#fff\\\" d=\\\"M346.87,87.48l-.04,149.4c0,3.28-3.74,5.17-6.38,3.21l-43.33-32.05-146.46-107.73c-1.03-.75-1.63-1.95-1.63-3.23l.07-93.09C149.11,1.79,150.9,0,153.11,0l108.55.03c2.21,0,4,1.79,4,4l-.07,75.2c0,2.21,1.78,4,3.99,4l73.31.24c2.2,0,3.99,1.8,3.99,4Z\\\"/>\\n    <path fill=\\\"#fff\\\" d=\\\"M201.34,242.31L29.03,120.5C12.8,109.02,2.3,92.03.6,71.98c0-.1-.01-.19-.02-.29-.22-10.23-.93-20.1-.38-30.91.16-3.13,3.72-4.85,6.29-3.06l235.27,164.33c1.07.75,1.71,1.97,1.71,3.28v59.22c.01,3.25-3.66,5.14-6.31,3.26l-35.83-25.5Z\\\"/>\\n    <path fill=\\\"#fff\\\" d=\\\"M207.07,332.26L54.36,223.69c-.17-.12-.33-.26-.48-.4-12.09-11.63-19.71-26.29-19.6-42.96l.14-22.35c.02-3.24,3.67-5.11,6.31-3.24l199.61,141.59c1.42,1.01,2.04,2.82,1.51,4.47-4.73,14.76-15.5,26.93-31.18,31.98-1.22.39-2.55.2-3.59-.54Z\\\"/>\\n    <path fill=\\\"#fff\\\" d=\\\"M108.54,330.81l-28.07-19.96c-12.75-9.06-15.47-27.69-14.65-44.47.16-3.17,3.72-4.94,6.31-3.1l90.08,63.89c3.16,2.24,1.6,7.23-2.28,7.26l-40.37.39c-4.21.04-7.87-1.73-11.03-4.01Z\\\"/>\\n  </svg></span>\\n    <span class=\\\"drovyu-preview-badge__muted\\\">Preview by</span>\\n    <span class=\\\"drovyu-preview-badge__brand\\\">Drovyu</span>\\n  </a>\\n  <a class=\\\"drovyu-preview-badge__support\\\" href=\\\"https://ko-fi.com/drovyu\\\" target=\\\"_blank\\\" rel=\\\"noopener noreferrer\\\" title=\\\"Support on Ko-fi\\\">\\n    <span class=\\\"drovyu-preview-badge__cup\\\" aria-hidden=\\\"true\\\"></span>\\n    <span>コーヒーで応援</span>\\n  </a>\\n</div>\";document.documentElement.append(host);})();</script>";
        html = html.includes("</body>") ? html.replace("</body>", additions + "</body>") : html + additions;
        return new Response(html, {headers});
      }
      if(file.mime === "text/css"){
        return new Response(rewritePreviewText(new TextDecoder().decode(plain), m, filePath), {headers});
      }
      if(file.mime === "text/javascript" || file.mime === "application/javascript"){
        return new Response(new TextDecoder().decode(plain), {headers});
      }
      return new Response(plain, {headers});
    } catch (error) {
      return decryptErrorResponse();
    }
  })());
});
