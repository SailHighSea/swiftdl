// SwiftDL page helper.
// - Shows a "Download video" button over video players. Clicking it lists
//   the media files the page loaded and sends the chosen one to SwiftDL.
// - Alt+click on a link tells the background to let the browser handle
//   that one download itself.
// Everything lives in a closed shadow root so page styles can't touch it.

(() => {
  if (window.__swiftdlLoaded) return;
  window.__swiftdlLoaded = true;

  // Alt+click: skip SwiftDL for this download.
  document.addEventListener("click", (e) => {
    if (e.altKey && e.target.closest?.("a[href]")) chrome.runtime.sendMessage({ type: "bypass" }).catch(() => {});
  }, true);

  // Magnet links aren't downloads, so the browser would hand them to another
  // app. Send them to SwiftDL; if it can't take them, open the link as usual.
  document.addEventListener("click", async (e) => {
    const a = e.target.closest?.('a[href^="magnet:"]');
    if (!a || e.altKey || e.button !== 0 || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    let res;
    try { res = await chrome.runtime.sendMessage({ type: "magnet", url: a.href }); } catch { res = null; }
    if (!res?.ok) location.href = a.href;
  }, true);

  const MIN_W = 200, MIN_H = 112;
  // Video sites SwiftDL downloads through yt-dlp: the page itself is sent,
  // and the quality is chosen in SwiftDL.
  const VIDEO_SITE = /(^|\.)(youtube\.com|youtube-nocookie\.com|vimeo\.com|x\.com|twitter\.com|reddit\.com|instagram\.com|tiktok\.com|facebook\.com|twitch\.tv|dailymotion\.com|bilibili\.com)$/i;
  const onVideoSite = () => VIDEO_SITE.test(location.hostname);

  // On feeds (Reddit home, Facebook, YouTube home...) the address bar isn't the
  // video's page, so yt-dlp says "Unsupported URL". Look for the post or video
  // link around the player instead, walking out through shadow roots too.
  const POST_LINK = /\/comments\/[a-z0-9]+|\/(reel|reels|videos|watch|shorts|status|tv|p|video|clip)\/|\/share\/[rvp]\/|[?&]v=|\/posts\/|\/permalink|story_fbid|pfbid|\/stories\/\d+\/[^/?#]+/i;
  function pageUrlFor(v) {
    const abs = (h) => { try { return new URL(h, location.href).href; } catch { return null; } };
    let n = v, depth = 0;
    while (n && depth < 14) {
      if (n.getAttribute) {
        const pl = n.getAttribute("permalink") || n.getAttribute("content-href");
        if (pl && /\/comments\//.test(pl)) return abs(pl);
        if (n.tagName === "A" && n.href && POST_LINK.test(n.href)) return n.href;
      }
      // Stop once the container holds several videos: a feed's first link
      // would belong to some other post.
      if (n.querySelectorAll && n !== v && n.querySelectorAll("video").length > 1) break;
      if (n.querySelectorAll && n !== document.documentElement) {
        for (const a of n.querySelectorAll("a[href]")) {
          if (POST_LINK.test(a.getAttribute("href") || "")) { const u = abs(a.getAttribute("href")); if (u) return u; }
        }
      }
      n = n.parentNode instanceof ShadowRoot ? n.parentNode.host : n.parentNode;
      depth++;
    }
    // Facebook posts nest deeper than the walk above reaches, and fill in a
    // timestamp link's address only when the pointer touches it.
    const post = v.closest?.('[role="article"]');
    if (post) {
      const find = () => {
        for (const a of post.querySelectorAll("a[href]")) {
          const h = a.getAttribute("href") || "";
          if (POST_LINK.test(h)) return abs(h);
        }
        return null;
      };
      let u = find();
      if (u) return u;
      const stamp = /\b(\d+\s?(s|m|h|d|w|y|min|mins|hr|hrs)|\d+ (second|minute|hour|day|week|year)s?|yesterday|just now)\b/i;
      for (const a of post.querySelectorAll('a[role="link"], a[href]')) {
        if (!stamp.test(a.textContent || "") || (a.textContent || "").length > 30) continue;
        for (const t of ["mouseover", "mouseenter", "mousemove", "focusin"]) a.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true }));
        const h = a.getAttribute("href") || "";
        if (h && h !== "#" && !/^javascript:/i.test(h)) { u = abs(h); if (u && new URL(u).pathname.length > 1) return u; }
      }
    }
    return location.href;
  }
  const LOGO = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#2a2c32"/><path d="M8 7l4 4 4-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><path d="M8 11.3l4 4 4-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="7.6" y="17" width="8.8" height="1.9" rx=".95" fill="#fff"/></svg>`;

  let host, root, wrap, btn, panel, video = null, hideTimer = 0, raf = 0, open = false;

  function build() {
    host = document.createElement("swiftdl-overlay");
    host.style.cssText = "all:initial;position:fixed;inset:0 auto auto 0;width:0;height:0;z-index:2147483647;";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: "Segoe UI Variable Text", "Segoe UI", -apple-system, system-ui, sans-serif; }
      /* max-content: anchored at the video's right edge, the wrap would
         otherwise only get the space left before the window edge, and on a
         large video "Download video" broke onto two lines. */
      .wrap { position: fixed; width: max-content; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; transform: translateX(-100%); opacity: 0; transition: opacity .15s; pointer-events: none; }
      .wrap.on { opacity: 1; pointer-events: auto; }
      .btn { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px 0 8px; white-space: nowrap; border: 0; border-radius: 9px;
        background: rgba(20, 21, 26, .86); color: #fff; font-size: 12.5px; font-weight: 600; letter-spacing: -.005em; cursor: pointer;
        box-shadow: 0 0 0 2px #3b82f6, 0 6px 20px rgba(0,0,0,.35); backdrop-filter: blur(14px) saturate(1.5); }
      .btn:hover { background: rgba(30, 31, 38, .94); box-shadow: 0 0 0 2px #60a5fa, 0 6px 20px rgba(0,0,0,.35); }
      .btn .chev { opacity: .6; margin-left: 2px; transition: transform .15s; }
      .wrap.open .btn .chev { transform: rotate(180deg); }
      .panel { width: 320px; max-height: 300px; overflow: auto; padding: 6px; border-radius: 12px; background: rgba(22, 23, 28, .94); color: #eef0f3;
        box-shadow: 0 0 0 1px rgba(255,255,255,.1), 0 16px 48px rgba(0,0,0,.5); backdrop-filter: blur(18px) saturate(1.5); display: none; }
      .wrap.open .panel { display: block; animation: pop .14s ease-out; }
      @keyframes pop { from { opacity: 0; transform: translateY(-4px); } }
      .head { padding: 6px 8px 6px; font-size: 11.5px; font-weight: 600; color: #8a8e98; }
      .item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px; border: 0; border-radius: 8px; background: none; color: inherit; text-align: left; cursor: pointer; }
      .item:hover { background: rgba(255,255,255,.07); }
      .item[disabled] { cursor: default; opacity: .55; }
      .item[disabled]:hover { background: none; }
      .tag { flex: none; min-width: 42px; height: 20px; padding: 0 6px; border-radius: 5px; display: grid; place-items: center; font-size: 10.5px; font-weight: 700; letter-spacing: .03em;
        background: rgba(255,255,255,.1); color: #e6e8ec; }
      .tag.stream { background: rgba(255,255,255,.08); color: #8a8e98; }
      .meta { flex: 1; min-width: 0; }
      .meta b { display: block; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .meta span { display: block; margin-top: 1px; font-size: 11.5px; color: #8a8e98; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .msg { padding: 10px 8px 12px; font-size: 12.5px; color: #a4a8b1; line-height: 1.5; }
      .msg.ok { color: #4cb782; } .msg.err { color: #eb6b6b; }
    </style>
    <div class="wrap"><button class="btn" title="Download with SwiftDL">${LOGO}<span>Download video</span><svg class="chev" width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg></button><div class="panel"></div></div>`;
    wrap = root.querySelector(".wrap");
    btn = root.querySelector(".btn");
    panel = root.querySelector(".panel");
    btn.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); toggle(); });
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = e.target.closest(".item:not([disabled])");
      if (item) grab(item.dataset.url, item.dataset.name);
    });
    wrap.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    wrap.addEventListener("mouseleave", () => scheduleHide());
    mount();
  }

  function mount() {
    const parent = document.fullscreenElement || document.documentElement;
    if (host && host.parentNode !== parent) parent.append(host);
  }
  document.addEventListener("fullscreenchange", () => host && mount());

  const bytes = (n) => {
    if (!n) return "";
    const u = ["B", "KB", "MB", "GB"]; let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
  };
  const extOf = (url, mime) => (/\.([a-z0-9]{2,4})(?:$|[?#])/i.exec(new URL(url).pathname) || [])[1]?.toLowerCase() || (mime.split("/")[1] || "").replace(/^x-/, "").slice(0, 4) || "mp4";
  const title = () => (document.title || "video").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

  function position() {
    if (!video || !wrap.classList.contains("on")) { raf = 0; return; }
    const r = video.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H || r.bottom < 0 || r.top > innerHeight) { hide(); raf = 0; return; }
    wrap.style.left = `${Math.min(innerWidth - 8, r.right - 10)}px`;
    wrap.style.top = `${Math.max(8, r.top + 10)}px`;
    raf = requestAnimationFrame(position);
  }
  function show(v) {
    if (!host) build();
    mount();
    if (video !== v) { video = v; setOpen(false); }
    clearTimeout(hideTimer);
    wrap.classList.add("on");
    if (!raf) raf = requestAnimationFrame(position);
  }
  function hide() { wrap?.classList.remove("on"); setOpen(false); video = null; }
  function scheduleHide() { clearTimeout(hideTimer); if (!open) hideTimer = setTimeout(hide, 1600); }
  function setOpen(v) { open = v; wrap?.classList.toggle("open", v); }

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (onVideoSite()) {
      const u = pageUrlFor(video);
      // A site's front page isn't a video (yt-dlp would only say "Unsupported
      // URL"), so with no link of its own, e.g. an ad, list the loaded files.
      // Facebook stories aren't supported by yt-dlp either; those go the file route.
      const p = new URL(u).pathname.replace(/\/+$/, "");
      if (p !== "" && !/^\/stories\//i.test(p)) return grab(u, title());
    }
    panel.innerHTML = `<div class="msg">Looking for downloadable files…</div>`;
    let res;
    try { res = await chrome.runtime.sendMessage({ type: "media" }); } catch { res = { items: [] }; }
    const items = [...(res?.items || [])];
    const src = video?.currentSrc;
    if (src && /^https?:/i.test(src) && !items.some((m) => m.url === src)) items.unshift({ url: src, kind: "file", mime: "video/mp4", size: 0 });
    const files = items.filter((m) => m.kind === "file");
    const streams = items.filter((m) => m.kind !== "file");
    const name = title();
    let html = "";
    if (files.length) {
      html += `<div class="head">Video and audio on this page</div>`;
      html += files.map((m) => {
        const ext = extOf(m.url, m.mime || "");
        const kind = /^audio/.test(m.mime) || /mp3|m4a|aac|ogg|opus|flac|wav/.test(ext) ? "Audio" : "Video";
        return `<button class="item" data-url="${encodeURI(m.url).replace(/"/g, "%22")}" data-name="${name.replace(/"/g, "'")}.${ext}"><span class="tag">${ext.toUpperCase()}</span><span class="meta"><b>${kind}${m.size ? ` · ${bytes(m.size)}` : ""}</b><span>${new URL(m.url).hostname}</span></span></button>`;
      }).join("");
    }
    if (streams.length) {
      html += `<div class="head">Streams</div>` + streams.slice(0, 3).map((m) =>
        `<button class="item" disabled><span class="tag stream">${m.kind.toUpperCase()}</span><span class="meta"><b>Streaming video</b><span>Not supported yet</span></span></button>`).join("");
    }
    if (!files.length && !streams.length) html = `<div class="msg">${onVideoSite() ? "This video has no link of its own (it may be an ad). Open the video's page, for example by clicking its time or title, and try again." : "No downloadable file found yet. Play the video for a moment, then try again."}</div>`;
    else if (!files.length) html += `<div class="msg">This video streams in pieces (HLS/DASH), which SwiftDL can't download yet.</div>`;
    panel.innerHTML = html;
  }

  async function grab(url, filename) {
    panel.innerHTML = `<div class="msg">Sending to SwiftDL…</div>`;
    let res;
    try { res = await chrome.runtime.sendMessage({ type: "grab", url: decodeURI(url), filename }); } catch (e) { res = { ok: false, error: String(e) }; }
    panel.innerHTML = res?.ok
      ? `<div class="msg ok">Sent to SwiftDL ✓</div>`
      : `<div class="msg err">Couldn't reach SwiftDL. Make sure the app is installed and has been opened once.</div>`;
    setTimeout(() => { setOpen(false); scheduleHide(); }, 1800);
  }

  // Find the video under the pointer, even when the site layers controls
  // on top of it.
  // Reddit (and others) keep the <video> inside shadow roots, which
  // document.elementsFromPoint doesn't look into: descend into open ones.
  function videoAt(e) {
    const direct = e.composedPath().find((el) => el.tagName === "VIDEO");
    if (direct) return direct;
    const seen = new Set();
    const scan = (rootNode) => {
      if (seen.has(rootNode)) return null;
      seen.add(rootNode);
      for (const el of rootNode.elementsFromPoint(e.clientX, e.clientY)) {
        if (el.tagName === "VIDEO") return el;
        if (el.shadowRoot) { const f = scan(el.shadowRoot); if (f) return f; }
      }
      return null;
    };
    return scan(document);
  }

  let last = 0, disabled = null;
  document.addEventListener("mousemove", async (e) => {
    const now = performance.now();
    if (now - last < 120) return;
    last = now;
    if (host && e.composedPath().includes(host)) return;
    const v = videoAt(e);
    if (v) {
      const r = v.getBoundingClientRect();
      if (r.width < MIN_W || r.height < MIN_H) return;
      if (disabled === null) {
        try { disabled = (await chrome.runtime.sendMessage({ type: "media" }))?.disabled ?? false; } catch { disabled = false; }
      }
      if (!disabled) show(v);
    } else if (video) scheduleHide();
  }, { passive: true });
  document.addEventListener("click", (e) => { if (open && host && !e.composedPath().includes(host)) setOpen(false); }, true);
  chrome.storage.onChanged.addListener((c) => { if (c.disabledSites) disabled = null; });
})();
