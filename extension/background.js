// SwiftDL browser integration.
//
// 1. Catches downloads the browser starts and hands them to the SwiftDL app
//    (through native messaging), with the cookies and referrer the site
//    expects, so downloads behind a login keep working. If the app isn't
//    installed or refuses, the browser simply finishes the download itself.
// 2. Watches each tab's network traffic for video and audio files so the
//    page button and the popup can offer them for download.

const HOST = "com.swiftdl.host";
const DEFAULTS = { enabled: true, minSizeKB: 0, disabledSites: [], capturePost: true };

const getSettings = () => chrome.storage.sync.get(DEFAULTS);
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

// Last few events, kept for troubleshooting (service worker console or
// chrome.storage.local "log").
async function log(event) {
  console.log("SwiftDL:", event);
  const { log: entries = [] } = await chrome.storage.local.get("log");
  entries.push(`${new Date().toISOString()} ${event}`);
  await chrome.storage.local.set({ log: entries.slice(-30) });
}

// Firefox doesn't grant a Manifest V3 add-on its site access automatically;
// without it webRequest sees nothing (no POST bodies, no video detection).
chrome.permissions?.contains({ origins: ["<all_urls>"] })
  .then((ok) => log(ok ? "site access granted" : "site access NOT granted: allow it in about:addons > SwiftDL > Permissions"))
  .catch(() => {});

// ---------- talking to the app ----------

async function cookieHeader(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    return "";
  }
}

async function sendToApp({ url, referrer, filename, post }) {
  const message = {
    type: "download",
    url,
    referrer: referrer || "",
    filename: filename ? filename.split(/[\\/]/).pop() : "",
    cookies: await cookieHeader(url),
    userAgent: navigator.userAgent,
    ...(post ? { method: "POST", body: post.body, contentType: post.contentType } : {}),
  };
  const reply = await chrome.runtime.sendNativeMessage(HOST, message);
  if (!reply?.ok) throw new Error(reply?.error || "SwiftDL did not accept the download");
}

const ping = () =>
  chrome.runtime.sendNativeMessage(HOST, { type: "ping" })
    .then((r) => ({ ok: !!r?.ok, version: r?.version }))
    .catch((e) => ({ ok: false, error: String(e?.message || e) }));

function flashBadge(text, color, tabId) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text, ...(tabId ? { tabId } : {}) });
  setTimeout(() => refreshBadge(tabId), 2500);
}

// ---------- catching browser downloads ----------

// Hold Alt while clicking a link to let the browser download it instead.
let bypassUntil = 0;

// True when the site the download came from, its referrer or the page the
// user is on is switched off. (A download's own host is often a CDN, not the
// site the user sees, e.g. OneDrive pages download from svc.ms.)
async function siteDisabled(...urls) {
  const { disabledSites } = await getSettings();
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url) urls.push(tab.url);
  } catch {}
  return urls.some((u) => { const host = hostOf(u); return !!host && disabledSites.includes(host); });
}

// Downloads that start from a POST (OneDrive/SharePoint "download as zip",
// form buttons). The downloads API doesn't say which method was used or what
// was sent, so watch POST requests and keep their body for a short while; if
// a download then starts from one, the app repeats the same POST.
const MAX_POST_BODY = 512 * 1024; // bigger bodies are left to the browser
const posts = new Map(); // exact url -> record
const postsById = new Map(); // requestId -> record
const WEB = { urls: ["http://*/*", "https://*/*"] };

function prunePosts() {
  const old = Date.now() - 120000;
  for (const [u, r] of posts) if (r.at < old) { posts.delete(u); postsById.delete(r.id); }
}

chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.method !== "POST") return;
    const rec = { id: d.requestId, url: d.url, at: Date.now(), raw: null, form: null, tooBig: false, contentType: "", filename: "" };
    const rb = d.requestBody;
    if (rb?.raw?.length) {
      const parts = rb.raw.map((p) => (p.bytes ? new Uint8Array(p.bytes) : null));
      const total = parts.reduce((n, p) => n + (p ? p.length : 0), 0);
      if (parts.some((p) => !p) || total > MAX_POST_BODY) rec.tooBig = true; // file uploads etc.
      else {
        rec.raw = new Uint8Array(total);
        let o = 0;
        for (const p of parts) { rec.raw.set(p, o); o += p.length; }
      }
    } else if (rb?.formData) {
      const p = new URLSearchParams();
      for (const [k, vs] of Object.entries(rb.formData)) for (const v of vs) p.append(k, v);
      rec.form = p.toString();
      if (rec.form.length > MAX_POST_BODY) rec.tooBig = true;
    }
    prunePosts();
    posts.set(d.url, rec);
    postsById.set(d.requestId, rec);
    log(`POST ${noQuery(d.url)} body=${rec.raw ? rec.raw.length : rec.form != null ? rec.form.length : 0}${rec.tooBig ? " (too big)" : ""}`);
  },
  WEB,
  ["requestBody"],
);
chrome.webRequest.onBeforeSendHeaders.addListener(
  (d) => {
    const rec = postsById.get(d.requestId);
    if (rec) rec.contentType = header(d.requestHeaders, "content-type");
  },
  WEB,
  ["requestHeaders"],
);
chrome.webRequest.onHeadersReceived.addListener(
  (d) => {
    const rec = postsById.get(d.requestId);
    if (!rec) return;
    const cd = header(d.responseHeaders, "content-disposition");
    const star = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(cd);
    const plain = /filename\s*=\s*("([^"]+)"|[^;]+)/i.exec(cd);
    try { rec.filename = star ? decodeURIComponent(star[1].trim()) : plain ? (plain[2] || plain[1]).trim() : ""; } catch { rec.filename = plain?.[2] || ""; }
  },
  WEB,
  ["responseHeaders"],
);
// A POST often answers with a redirect to the file; the download then shows
// the redirect target as its URL, so remember that it came from the POST.
chrome.webRequest.onBeforeRedirect.addListener(
  (d) => {
    const rec = postsById.get(d.requestId);
    if (!rec) return;
    posts.set(d.redirectUrl, rec);
    log(`POST redirected to ${noQuery(d.redirectUrl)}`);
  },
  WEB,
);
const noQuery = (u) => String(u || "").split(/[?#]/)[0];

// The POST that started this download, as {body (base64), contentType,
// filename}, "unsupported" when it can't be repeated, or null for a GET.
function postFor(...urls) {
  const rec = urls.map((u) => posts.get(u)).find(Boolean)
    || [...posts.values()].find((r) => urls.some((u) => u && noQuery(u) === noQuery(r.url)));
  if (!rec) return null;
  let bytes = rec.raw;
  if (!bytes && rec.form != null && !/multipart/i.test(rec.contentType)) bytes = new TextEncoder().encode(rec.form);
  if (rec.tooBig || !bytes) return "unsupported";
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return { url: rec.url, body: btoa(bin), contentType: rec.contentType || "application/x-www-form-urlencoded", filename: rec.filename };
}

chrome.downloads.onCreated.addListener(async (item) => {
  const settings = await getSettings();
  const url = item.finalUrl || item.url;
  await log(`created #${item.id} state=${item.state} ${url}`);
  if (!settings.enabled || item.state !== "in_progress") return;
  // blob:, data: and file: URLs only exist inside the browser.
  if (!/^https?:/i.test(url)) return;
  if (Date.now() < bypassUntil) { bypassUntil = 0; await log(`#${item.id} Alt held: left to the browser`); return; }
  if (await siteDisabled(item.referrer, url)) { await log(`#${item.id} site switched off: left to the browser`); return; }
  if (settings.minSizeKB > 0 && item.totalBytes > 0 && item.totalBytes < settings.minSizeKB * 1024) return;

  // Started by a form POST? Hand over the request body too, unless that's
  // switched off or the request can't be repeated.
  const post = postFor(item.url, item.finalUrl);
  if (post && (!settings.capturePost || post === "unsupported")) {
    await log(`#${item.id} started by a POST: left to the browser${post === "unsupported" ? " (can't be repeated)" : ""}`);
    return;
  }

  // Pause first so the browser doesn't keep downloading while we ask the app.
  await chrome.downloads.pause(item.id).catch(() => {});
  try {
    await sendToApp({
      url: post ? post.url : url,
      referrer: item.referrer,
      filename: post?.filename || item.filename,
      post: post || undefined,
    });
    await chrome.downloads.cancel(item.id).catch(() => {});
    await chrome.downloads.erase({ id: item.id }).catch(() => {});
    await log(`#${item.id} handed to SwiftDL`);
    flashBadge("✓", "#2f9e6a");
  } catch (err) {
    await log(`#${item.id} left to the browser: ${err?.message || err}`);
    await chrome.downloads.resume(item.id).catch(() => {});
    flashBadge("!", "#dc4b4b");
  }
});

// ---------- media detection ----------
// Per tab, the video/audio files and streams the page has loaded. Kept in
// session storage because the service worker can be stopped at any time.

const MEDIA_EXT = /\.(mp4|m4v|webm|mkv|mov|avi|flv|wmv|mp3|m4a|aac|ogg|oga|opus|flac|wav)(?:$|[?#])/i;
const STREAM_EXT = /\.(m3u8|mpd)(?:$|[?#])/i;
const SEGMENT = /\.(ts|m4s|aac)(?:$|[?#])|[?&](range|bytestart)=/i;
const MIN_FILE_BYTES = 512 * 1024;
const key = (tabId) => `media:${tabId}`;

function classify(url, mime, size) {
  if (/mpegurl/i.test(mime) || /\.m3u8(?:$|[?#])/i.test(url)) return "hls";
  if (/dash\+xml/i.test(mime) || /\.mpd(?:$|[?#])/i.test(url)) return "dash";
  const isMedia = /^(video|audio)\//i.test(mime) || MEDIA_EXT.test(url);
  if (!isMedia || /mp2t/i.test(mime) || SEGMENT.test(url)) return null;
  if (size && size < MIN_FILE_BYTES) return null;
  return "file";
}

function header(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name)?.value || "";
}

chrome.webRequest.onResponseStarted.addListener(
  async (d) => {
    if (d.tabId < 0 || d.statusCode >= 400) return;
    const mime = header(d.responseHeaders, "content-type").split(";")[0].trim().toLowerCase();
    const range = header(d.responseHeaders, "content-range");
    const size = Number(range.split("/")[1]) || Number(header(d.responseHeaders, "content-length")) || 0;
    const kind = classify(d.url, mime, size);
    if (!kind) return;
    const url = d.url.replace(/([?&])(range|rn|rbuf)=[^&]*/gi, "$1").replace(/[?&]$/, "");
    const { [key(d.tabId)]: list = [] } = await chrome.storage.session.get(key(d.tabId));
    if (list.some((m) => m.url === url)) return;
    list.unshift({ url, kind, mime, size, at: Date.now() });
    await chrome.storage.session.set({ [key(d.tabId)]: list.slice(0, 25) });
    refreshBadge(d.tabId);
  },
  { urls: ["http://*/*", "https://*/*"], types: ["media", "xmlhttprequest", "other", "object"] },
  ["responseHeaders"],
);

async function mediaFor(tabId) {
  const { [key(tabId)]: list = [] } = await chrome.storage.session.get(key(tabId));
  return list;
}

async function refreshBadge(tabId) {
  if (tabId == null) { chrome.action.setBadgeText({ text: "" }); return; }
  const files = (await mediaFor(tabId)).filter((m) => m.kind === "file").length;
  chrome.action.setBadgeBackgroundColor({ color: "#0a84ff", tabId });
  chrome.action.setBadgeText({ text: files ? String(files) : "", tabId });
}

// A new page in the tab starts a fresh list.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading" && info.url) chrome.storage.session.remove(key(tabId)).then(() => refreshBadge(tabId));
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(key(tabId)));

// ---------- right-click menu ----------

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "swiftdl-link", title: "Download with SwiftDL", contexts: ["link"] });
    chrome.contextMenus.create({ id: "swiftdl-media", title: "Download with SwiftDL", contexts: ["video", "audio", "image"] });
  });
}
chrome.runtime.onInstalled.addListener(() => { createMenus(); ping(); });
chrome.runtime.onStartup.addListener(() => { createMenus(); ping(); });

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.srcUrl;
  if (!url || !/^https?:/i.test(url)) return flashBadge("!", "#dc4b4b", tab?.id);
  try {
    await sendToApp({ url, referrer: info.pageUrl || tab?.url });
    flashBadge("✓", "#2f9e6a", tab?.id);
  } catch (err) {
    await log(`context menu: could not reach the app: ${err?.message || err}`);
    flashBadge("!", "#dc4b4b", tab?.id);
  }
});

// ---------- messages from the page button and the popup ----------

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const tabId = msg.tabId ?? sender.tab?.id;
  const pageUrl = msg.pageUrl || sender.tab?.url || "";
  (async () => {
    switch (msg?.type) {
      case "ping": return ping();
      case "bypass": bypassUntil = Date.now() + 4000; return { ok: true };
      case "media": return { items: await mediaFor(tabId), disabled: await siteDisabled(pageUrl) };
      case "grab":
        try {
          await sendToApp({ url: msg.url, referrer: pageUrl, filename: msg.filename });
          return { ok: true };
        } catch (e) {
          return { ok: false, error: String(e?.message || e) };
        }
      case "magnet": {
        const { enabled } = await getSettings();
        if (!enabled || (await siteDisabled(pageUrl))) return { ok: false };
        try {
          await sendToApp({ url: msg.url, referrer: pageUrl });
          flashBadge("✓", "#2f9e6a", tabId);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: String(e?.message || e) };
        }
      }
      case "show":
        return chrome.runtime.sendNativeMessage(HOST, { type: "show" }).catch((e) => ({ ok: false, error: String(e) }));
      case "toggle-site": {
        const { disabledSites } = await getSettings();
        const host = hostOf(pageUrl);
        const next = disabledSites.includes(host) ? disabledSites.filter((h) => h !== host) : [...disabledSites, host];
        await chrome.storage.sync.set({ disabledSites: next });
        return { disabled: next.includes(host) };
      }
    }
  })().then(respond);
  return true; // async response
});
