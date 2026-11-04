// The per-download window, like IDM's:
//   download.html?confirm=<token>  "New download": a file caught from the
//                                  browser, waiting for Start / Later / Cancel
//   download.html?id=<id>          live progress, then "Download complete"

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const win = window.__TAURI__.window?.getCurrentWindow?.();
const LogicalSize = window.__TAURI__.dpi?.LogicalSize;

// ---------- helpers ----------
const P = {
  check: '<path d="m5.5 12.5 4 4 9-9"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16h.01"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5H9l2 2h7.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  open: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 18V8a1.5 1.5 0 0 1 1.5-1.5h4"/>',
  retry: '<path d="M4.5 12a7.5 7.5 0 0 1 13.2-4.8L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-13.2 4.8L4.5 15M4.5 19.5V15H9"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  chevDown: '<path d="m6 9.5 6 6 6-6"/>',
  chevUp: '<path d="m6 14.5 6-6 6 6"/>',
  video: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
  music: '<path d="M9 17.5V6.3l10-1.8v11"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  app: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17"/><path d="M6.6 6.8h.01M9 6.8h.01" stroke-width="2.2"/>',
  archive: '<path d="M12 3.3 20 7.4v9.2l-8 4.1-8-4.1V7.4z"/><path d="m4 7.4 8 4.1 8-4.1M12 11.5v9.2M8 5.3l8 4.1"/>',
  doc: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 15.5-4.5-4.5-9.5 8.5"/>',
  file: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/><path d="M6 8h4M14 8h4"/>',
};
const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${P[n] || P.file}</svg>`;
const CATS = {
  Video: { color: "#8b5cf6", icon: "video" }, Music: { color: "#ec4899", icon: "music" }, Programs: { color: "#3b82f6", icon: "app" },
  Compressed: { color: "#f59e0b", icon: "archive" }, Torrents: { color: "#14b8a6", icon: "magnet" }, Documents: { color: "#10b981", icon: "doc" }, Images: { color: "#f97316", icon: "image" },
  Other: { color: "#8b8f98", icon: "file" },
};
const catOf = (name) => {
  const e = (/\.([a-z0-9]{1,5})$/i.exec(name || "") || [])[1]?.toLowerCase() || "";
  if (/^(zip|rar|7z|tar|gz|tgz|xz|bz2|zst|iso|img)$/.test(e)) return "Compressed";
  if (/^(pdf|docx?|xlsx?|pptx?|odt|txt|rtf|epub|csv|md)$/.test(e)) return "Documents";
  if (/^(mp3|wav|flac|aac|ogg|m4a|opus|wma)$/.test(e)) return "Music";
  if (/^(mp4|mkv|avi|mov|webm|flv|wmv|m4v|mpe?g|3gp|ts)$/.test(e)) return "Video";
  if (/^(exe|msi|dmg|pkg|deb|rpm|apk|appimage|msix|bat|jar)$/.test(e)) return "Programs";
  if (/^(jpe?g|png|gif|webp|svg|bmp|heic|avif)$/.test(e)) return "Images";
  return "Other";
};
const glyph = (cat) => `<span class="glyph">${icon((CATS[cat] || CATS.Other).icon)}</span>`;
const UNITS = ["B", "KB", "MB", "GB", "TB"];
function bytes(n) {
  if (n == null || !isFinite(n)) return "—";
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; }
  return `${i === 0 ? Math.round(n) : n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.round(n)} ${UNITS[i]}`;
}
const speed = (b) => (b > 0 ? `${bytes(b)}/s` : "—");
function dur(sec) {
  if (!isFinite(sec) || sec <= 0) return "—";
  sec = Math.ceil(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}
function when(ms) {
  if (!ms) return "";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  return new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const $ = (id) => document.getElementById(id);
const view = $("view");

// The window grows and shrinks to fit what it shows.
const fit = () => {
  if (!win || !LogicalSize) return;
  // The card plus the 16px transparent margin on each side (for its shadow).
  const h = Math.ceil($("root").getBoundingClientRect().height) + 32;
  win.setSize(new LogicalSize(552, Math.min(780, h)));
};
new ResizeObserver(fit).observe($("root"));
const setTitle = (t) => { $("w-title").textContent = t; document.title = t; win?.setTitle(t); };

$("w-min").onclick = () => win?.minimize();
$("w-close").onclick = () => (win ? win.close() : window.close());
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("w-close").click(); });
document.addEventListener("contextmenu", (e) => { if (!e.target.closest("input")) e.preventDefault(); });

const params = new URLSearchParams(location.search);

// Adds the download, or shows why it couldn't be added above the buttons
// (a failed click must never just do nothing). Returns its id, or null.
async function addDownload(req) {
  view.querySelector(".add-err")?.remove();
  try {
    return await invoke("add_download", { req });
  } catch (e) {
    view.querySelector(".d-foot")?.insertAdjacentHTML("beforebegin", `<p class="err add-err">Couldn't add the download: ${esc(String(e))}</p>`);
    return null;
  }
}

// ---------- New download (caught from the browser) ----------
async function confirmView(token) {
  setTitle("New download");
  const inc = await invoke("confirm_info", { token });
  if (!inc) { view.innerHTML = `<p class="muted">This download is no longer available.</p>`; return; }
  const { settings } = await invoke("get_state");
  const headers = [];
  if (inc.cookies) headers.push(["Cookie", inc.cookies]);
  if (inc.referrer) headers.push(["Referer", inc.referrer]);
  if (inc.userAgent) headers.push(["User-Agent", inc.userAgent]);
  let dir = settings.downloadDir, dirTouched = false, info = null;
  if (await invoke("is_media_url", { url: inc.url })) return mediaView(token, inc, settings, headers);
  if (await invoke("is_torrent_url", { url: inc.url, filename: inc.filename || null })) return torrentView(token, inc, settings, headers);

  const dirFor = (cat) => (settings.sortIntoCategories && cat !== "Other" ? `${settings.downloadDir}\\${cat}` : settings.downloadDir);
  view.innerHTML = `
    <div class="d-head"><span id="c-tile">${glyph("Other")}</span><div class="d-name"><input id="c-name" spellcheck="false" placeholder="Getting file details…"><div class="d-sub"><span class="st">${esc(host(inc.url))}</span></div></div></div>
    <div class="kv">
      <span class="k">Address</span><span class="v"><span title="${esc(inc.url)}">${esc(inc.url)}</span></span>
      <span class="k">Size</span><span class="v" id="c-size"><span class="spinner"></span><span class="muted">Checking…</span></span>
      <span class="k">Category</span><span class="v"><select id="c-cat">${Object.keys(CATS).map((c) => `<option>${c}</option>`).join("")}</select></span>
      <span class="k">Save to</span><span class="v"><span class="path" id="c-dir" title=""></span><button class="btn sm" id="c-browse">Change</button></span>
    </div>
    <div class="d-foot">
      <button class="btn" id="c-later">Download later</button>
      <span class="grow"></span>
      <button class="btn" id="c-cancel">Cancel</button>
      <button class="btn primary" id="c-start" disabled>Start download</button>
    </div>`;
  const setDir = (d) => { dir = d; $("c-dir").textContent = d; $("c-dir").title = d; };
  setDir(dir);
  $("c-start").focus();

  try {
    info = await invoke("probe_url", { url: inc.url, headers });
    const suggested = /\.[a-z0-9]{2,5}$/i.test(inc.filename || "") ? inc.filename.split(/[\\/]/).pop() : "";
    $("c-name").value = suggested || info.filename;
    $("c-cat").value = info.category;
    $("c-tile").innerHTML = glyph(info.category);
    setDir(info.dir);
    $("c-size").innerHTML = `<span>${info.size != null ? bytes(info.size) : "Unknown size"}</span><span class="muted">${info.resumable ? `Resumable · ${settings.connections} connections` : "Can't resume · 1 connection"}</span>`;
    $("c-start").disabled = false;
  } catch (e) {
    $("c-name").value = inc.filename || "download";
    $("c-size").innerHTML = `<span class="err">Couldn't reach the file: ${esc(String(e))}</span>`;
  }
  $("c-cat").onchange = () => { $("c-tile").innerHTML = glyph($("c-cat").value); if (!dirTouched) setDir(dirFor($("c-cat").value)); };
  $("c-browse").onclick = async () => { const d = await invoke("pick_folder", { start: dir }); if (d) { setDir(d); dirTouched = true; } };
  $("c-cancel").onclick = () => { invoke("forget_confirm", { token }); $("w-close").click(); };
  const add = async (start) => {
    const filename = $("c-name").value.trim();
    if (!filename) return;
    const id = await addDownload({ url: inc.url, filename, dir, headers, start, window: win?.label });
    if (id == null) return;
    invoke("forget_confirm", { token });
    if (!start) { $("w-close").click(); return; }
    history.replaceState(null, "", `?id=${id}`);
    progressView(id);
  };
  $("c-later").onclick = () => add(false);
  $("c-start").onclick = () => add(true);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && !$("c-start").disabled && !e.target.matches("select")) { e.preventDefault(); $("c-start").click(); } });
}

// ---------- Video tools (yt-dlp, deno, ffmpeg) ----------
// Video sites need three small programs. They're downloaded once, on the
// user's say-so, to a folder shown beforehand.
async function toolsPanel(box, status) {
  const missing = [!status.ytdlp && "yt-dlp", !status.deno && "deno", !status.ffmpeg && status.ffmpegDownloadable && "ffmpeg"].filter(Boolean);
  const size = (!status.ytdlp ? 18 : 0) + (!status.deno ? 40 : 0) + (!status.ffmpeg && status.ffmpegDownloadable ? 130 : 0);
  const needsFfmpeg = !status.ffmpeg && !status.ffmpegDownloadable;
  box.innerHTML = `
    <div class="tools">
      <b>Video downloads need ${missing.length === 1 ? "one more program" : "a few programs"}</b>
      <p class="muted">${missing.length ? `${missing.map(esc).join(", ")} · about ${size} MB, downloaded once from their official GitHub releases.` : ""}
        ${needsFfmpeg ? `<br>ffmpeg isn't installed. Install it with your package manager (brew install ffmpeg, or sudo apt install ffmpeg) to join video and audio.` : ""}</p>
      <p class="muted">Saved to <span class="path-inline" title="${esc(status.dir)}">${esc(status.dir)}</span>${status.portable ? " (portable: stays beside the app)" : ""}</p>
      <div class="tools-bar" hidden><div class="p-bar"><i></i></div><span class="muted" id="tools-note"></span></div>
      <div class="tools-row"><button class="btn primary sm" id="tools-go">Download tools</button><span class="err" id="tools-err"></span></div>
    </div>`;
  return new Promise((resolve) => {
    $("tools-go").onclick = async () => {
      $("tools-go").disabled = true;
      $("tools-err").textContent = "";
      const bar = box.querySelector(".tools-bar");
      bar.hidden = false;
      const poll = setInterval(async () => {
        const note = await invoke("tools_note").catch(() => null);
        if (!note) return;
        $("tools-note").textContent = note;
        const pct = /(\d+)%/.exec(note);
        bar.querySelector("i").style.width = pct ? `${pct[1]}%` : "100%";
        bar.querySelector(".p-bar").classList.toggle("indet", !pct);
      }, 250);
      try {
        await invoke("install_tools");
        clearInterval(poll);
        resolve(true);
      } catch (e) {
        clearInterval(poll);
        bar.hidden = true;
        $("tools-go").disabled = false;
        $("tools-go").textContent = "Try again";
        $("tools-err").textContent = String(e);
      }
    };
  });
}

// ---------- New download from a video site (and similar sites) ----------
// These go through yt-dlp: the page is probed for its qualities, and the
// chosen one becomes the download's format. "All formats" lets you pick the
// video stream, audio stream and container yourself.
const safeName = (s) => s.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 150) || "video";
const fpsOf = (s) => (s.fps > 30.5 ? Math.round(s.fps) : "");
const vLabel = (s) => [s.height ? `${s.height}p${fpsOf(s)}` : s.note || "video", s.videoCodec, s.kind === "both" && s.audioCodec ? `+ ${s.audioCodec}` : null, s.ext.toUpperCase(), s.size ? bytes(s.size) : null, `id ${s.id}`].filter(Boolean).join(" · ");
const aLabel = (s) => [s.audioCodec || "audio", s.bitrate ? `${Math.round(s.bitrate)} kbps` : null, s.sampleRate ? `${+(s.sampleRate / 1000).toFixed(1)} kHz` : null, s.ext.toUpperCase(), s.size ? bytes(s.size) : null, `id ${s.id}`].filter(Boolean).join(" · ");
const best = (list) => list.reduce((a, b) => (!a || (b.bitrate || 0) > (a.bitrate || 0) ? b : a), null);
const describe = (v, a) => [
  v && `${v.videoCodec || "Video"}${v.width && v.height ? ` ${v.width}×${v.height}` : ""}${v.fps ? ` ${Math.round(v.fps)} fps` : ""}`,
  a && `${a.audioCodec || "Audio"}${a.bitrate ? ` ${Math.round(a.bitrate)} kbps` : ""}`,
].filter(Boolean).join("  +  ");
// Which containers can hold which codecs.
const MP4_OK = { video: ["H.264", "H.265", "AV1", "VP9"], audio: ["AAC", "MP3", "Opus", "AC-3", "E-AC-3"] };
const WEBM_OK = { video: ["VP8", "VP9", "AV1"], audio: ["Opus", "Vorbis"] };
const fits = (ok, v, a) => (!v || ok.video.includes(v)) && (!a || ok.audio.includes(a));

const PREF = ["H.264", "VP9", "AV1", "H.265", "VP8"];
const CODECS_FOR = { mp4: ["H.264", "H.265", "AV1", "VP9"], webm: ["VP8", "VP9", "AV1"], mkv: null };

async function mediaView(token, inc, settings, headers) {
  let dir = settings.downloadDir, dirTouched = false, info = null, adv = false, legacy = false;
  let choices = [];
  const dirFor = (cat) => (settings.sortIntoCategories && cat !== "Other" ? `${settings.downloadDir}\\${cat}` : settings.downloadDir);
  view.innerHTML = `
    <div class="d-head"><span id="c-tile">${glyph("Video")}</span><div class="d-name"><input id="c-name" spellcheck="false" placeholder="Getting video details…"><div class="d-sub"><span class="st">${esc(host(inc.url))}</span></div></div></div>
    <div class="kv">
      <span class="k">Address</span><span class="v"><span title="${esc(inc.url)}">${esc(inc.url)}</span></span>
      <span class="k" id="c-qk">Quality</span><span class="v" id="c-q"><span class="spinner"></span><span class="muted">Getting video details…</span></span>
      <div class="adv" id="c-simple" hidden>
        <span class="k">Type</span><span class="v"><select id="c-type"><option value="video">Video</option><option value="audio">Audio only</option></select></span>
        <span class="k">Format</span><span class="v"><select id="c-fmt"></select></span>
        <span class="k">Codec</span><span class="v"><select id="c-codec"></select></span>
        <span class="k">Quality</span><span class="v"><select id="c-qs"></select></span>
      </div>
      <span class="v desc" id="c-desc"></span>
      <div class="adv" id="c-adv" hidden>
        <span class="k">Video</span><span class="v"><select id="c-v"></select></span>
        <span class="k">Audio</span><span class="v"><select id="c-a"></select></span>
        <span class="k">Container</span><span class="v"><select id="c-ct"><option value="mp4">MP4</option><option value="mkv">MKV</option><option value="webm">WebM</option></select></span>
        <span class="v desc" id="c-warn"></span>
      </div>
      <span class="k" id="c-subk" hidden>Subtitles</span><span class="v" id="c-subv" hidden><select id="c-sub"></select><label class="chk" id="c-embedl"><input type="checkbox" id="c-embed"> Embed in video</label></span>
      <span class="k">Save to</span><span class="v"><span class="path" id="c-dir" title=""></span><button class="btn sm" id="c-browse">Change</button></span>
    </div>
    <div id="c-tools"></div>
    <p class="muted note" id="c-first" hidden>Reading the page. This can take a few seconds.</p>
    <div class="d-foot">
      <button class="ghost-btn" id="c-more" hidden>${icon("chevDown")}All formats</button>
      <button class="btn" id="c-later" disabled>Download later</button>
      <span class="grow"></span>
      <button class="btn" id="c-cancel">Cancel</button>
      <button class="btn primary" id="c-start" disabled>Start download</button>
    </div>`;
  const setDir = (d) => { dir = d; $("c-dir").textContent = d; $("c-dir").title = d; };
  setDir(dirFor("Video"));
  $("c-browse").onclick = async () => { const d = await invoke("pick_folder", { start: dir }); if (d) { setDir(d); dirTouched = true; } };
  $("c-cancel").onclick = () => { invoke("forget_confirm", { token }); $("w-close").click(); };

  const all = () => info.streams;
  const videos = () => { const v = all().filter((s) => s.kind === "video"); return v.length ? v : all().filter((s) => s.kind === "both"); };
  const audios = () => all().filter((s) => s.kind === "audio");
  const allowed = (fmt, codec) => !CODECS_FOR[fmt] || CODECS_FOR[fmt].includes(codec);

  // ---- the simple pickers: Type, Format, Codec, Quality ----
  const setOptions = (sel, opts, keep) => {
    const old = keep ? sel.value : null;
    sel.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
    if (old != null && opts.some(([v]) => v === old)) sel.value = old;
  };
  const fillFormats = () => {
    if ($("c-type").value === "audio") {
      // M4A first: it plays everywhere.
      const exts = [...new Set(audios().map((s) => s.ext))].sort((a, b) => (b === "m4a") - (a === "m4a"));
      const name = { m4a: "M4A (AAC)", webm: "WebM (Opus)", mp3: "MP3", opus: "Opus", ogg: "Ogg" };
      setOptions($("c-fmt"), exts.map((e) => [e, name[e] || e.toUpperCase()]), true);
    } else {
      setOptions($("c-fmt"), [["mp4", "MP4"], ["mkv", "MKV"], ["webm", "WebM"]], true);
    }
  };
  const fillCodecs = () => {
    const fmt = $("c-fmt").value;
    if ($("c-type").value === "audio") {
      const codecs = [...new Set(audios().filter((s) => s.ext === fmt).map((s) => s.audioCodec).filter(Boolean))];
      setOptions($("c-codec"), codecs.map((c) => [c, c]), true);
      $("c-codec").disabled = codecs.length <= 1;
      return;
    }
    const codecs = [...new Set(videos().map((s) => s.videoCodec).filter((c) => c && allowed(fmt, c)))].sort((a, b) => PREF.indexOf(a) - PREF.indexOf(b));
    setOptions($("c-codec"), [["auto", "Auto (best compatible)"], ...codecs.map((c) => [c, c])], true);
    $("c-codec").disabled = false;
  };
  const fillQualities = () => {
    const fmt = $("c-fmt").value, codec = $("c-codec").value;
    const prevH = choices[Number($("c-qs").value)]?.height;
    if ($("c-type").value === "audio") {
      choices = audios().filter((s) => s.ext === fmt && (!codec || s.audioCodec === codec))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        .map((s) => ({ stream: s, label: `${s.bitrate ? Math.round(s.bitrate) + " kbps" : "Audio"}${s.sampleRate ? ` · ${+(s.sampleRate / 1000).toFixed(1)} kHz` : ""}${s.size ? ` · ${bytes(s.size)}` : ""}` }));
    } else {
      // One entry per height; the highest frame rate, then the preferred codec.
      const byHeight = new Map();
      for (const s of videos()) {
        if (!s.height || !allowed(fmt, s.videoCodec) || (codec !== "auto" && s.videoCodec !== codec)) continue;
        const cur = byHeight.get(s.height);
        const rank = (x) => [-(x.fps || 0) > -30.5 ? 0 : -1, PREF.indexOf(x.videoCodec), -(x.bitrate || 0)];
        const better = !cur || (() => { const a = rank(s), b = rank(cur); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; })();
        if (better) byHeight.set(s.height, s);
      }
      choices = [...byHeight.entries()].sort((a, b) => b[0] - a[0]).map(([h, s]) => {
        const a = s.kind === "both" ? null : audioFor(fmt);
        const size = s.size ? s.size + (a?.size || 0) : null;
        return { stream: s, height: h, label: `${h}p${fpsOf(s)}${size ? ` · ${bytes(size)}` : ""}` };
      });
    }
    setOptions($("c-qs"), choices.map((c, i) => [String(i), c.label]));
    // Keep the same height if there is one; else the best up to 1080p.
    let i = choices.findIndex((c) => c.height && c.height === prevH);
    if (i < 0) i = Math.max(0, choices.findIndex((c) => !c.height || c.height <= 1080));
    $("c-qs").value = String(i);
  };
  // The audio that goes with a video in this container.
  const audioFor = (fmt) => {
    const as = audios();
    if (fmt === "mp4") return best(as.filter((s) => s.ext === "m4a")) || best(as.filter((s) => s.audioCodec === "Opus")) || best(as);
    if (fmt === "webm") return best(as.filter((s) => ["Opus", "Vorbis"].includes(s.audioCodec)));
    return best(as);
  };
  const warnFor = (fmt, v, a) =>
    fmt === "webm" && a && !fits(WEBM_OK, v.videoCodec, a.audioCodec) ? `WebM can't hold ${v.videoCodec} + ${a.audioCodec}. Choose MKV or another stream.` :
      fmt === "webm" && !a ? "This video has no audio stream that fits WebM. Choose MP4 or MKV." :
      fmt === "mp4" && (v.videoCodec === "VP9" || v.videoCodec === "AV1" || a?.audioCodec === "Opus") ? "MP4 with this codec may not play in every player. H.264 plays everywhere." : "";

  const simplePick = () => {
    if (legacy) { const q = info.qualities[Number($("c-qs").value) || 0]; return { format: q.format, ext: q.ext, size: q.size, v: null, a: null, ok: true }; }
    const c = choices[Number($("c-qs").value) || 0];
    if (!c) return { ok: false };
    if ($("c-type").value === "audio") return { format: c.stream.id, ext: c.stream.ext, size: c.stream.size, v: null, a: c.stream, ok: true };
    const fmt = $("c-fmt").value, v = c.stream, a = v.kind === "both" ? null : audioFor(fmt);
    const warn = warnFor(fmt, v, a);
    return { format: a ? `${v.id}+${a.id}` : v.id, ext: v.kind === "both" ? v.ext : fmt, size: v.size ? v.size + (a?.size || 0) : null, v, a, ok: !warn.includes("can't") && !warn.includes("no audio"), warn };
  };

  // ---- the manual picker: any video stream + any audio stream ----
  const advPick = () => {
    const v = videos().find((s) => s.id === $("c-v").value) || null;
    const a = audios().find((s) => s.id === $("c-a").value) || null;
    if (!v && !a) return { ok: false };
    if (!v) return { format: a.id, ext: a.ext, size: a.size, v, a, ok: true };
    if (v.kind === "both" || !a) return { format: v.id, ext: v.ext, size: v.size, v, a: null, ok: true };
    const ext = $("c-ct").value, warn = warnFor(ext, v, a);
    return { format: `${v.id}+${a.id}`, ext, size: (v.size || 0) + (a.size || 0) || null, v, a, ok: !warn.includes("can't"), warn };
  };
  const pick = () => (adv ? advPick() : simplePick());

  // Subtitles: "file:en" saves a .srt beside the video, "embed:en" puts it inside.
  const subs = () => {
    const code = $("c-sub").value;
    if (!code) return null;
    const p = pick();
    return `${$("c-embed").checked && p.v ? "embed" : "file"}:${code}`;
  };
  const refresh = () => {
    const p = pick();
    // Embedding needs a video container; an audio file gets a separate subtitle file.
    $("c-embed").disabled = !p.v;
    if (!p.v) $("c-embed").checked = false;
    $("c-desc").textContent = adv ? "" : p.v || p.a ? describe(p.v, p.a) : "";
    $("c-warn").textContent = adv ? (p.v || p.a ? describe(p.v, p.a) + (p.warn ? `\n${p.warn}` : "") : "Choose a video or an audio stream") : "";
    if (!adv && p.warn) $("c-desc").textContent += `${$("c-desc").textContent ? "  ·  " : ""}${p.warn}`;
    const bad = p.ok === false && !!(p.warn || (adv && !p.v && !p.a));
    $("c-warn").classList.toggle("err", bad);
    $("c-desc").classList.toggle("err", bad && !adv);
    if (p.ok || p.ext) {
      const cat = p.ext === "m4a" || p.ext === "opus" || (!p.v && p.a) ? "Music" : "Video";
      if (p.ext) $("c-name").value = $("c-name").value.replace(/\.[a-z0-9]{2,4}$/i, "") + `.${p.ext}`;
      $("c-tile").innerHTML = glyph(cat);
      if (!dirTouched) setDir(dirFor(cat));
    }
    $("c-start").disabled = $("c-later").disabled = !p.ok;
  };

  // 1. Tools first, if they aren't there yet.
  const status = await invoke("tools_status").catch(() => null);
  if (status && (!status.ytdlp || !status.deno || (!status.ffmpeg && status.ffmpegDownloadable))) {
    $("c-q").innerHTML = `<span class="muted">Waiting for the video tools</span>`;
    await toolsPanel($("c-tools"), status);
    $("c-tools").innerHTML = "";
    $("c-q").innerHTML = `<span class="spinner"></span><span class="muted">Getting video details…</span>`;
  }

  // 2. Then the page.
  const slow = setTimeout(() => { $("c-first").hidden = false; }, 3000);
  try {
    info = await invoke("probe_media", { url: inc.url, cookies: inc.cookies || null });
    legacy = !info.streams.length;
    $("c-name").value = `${safeName(info.title)}.${info.qualities[0].ext}`;
    $("c-qk").hidden = $("c-q").hidden = true;
    $("c-simple").hidden = false;
    if (legacy) {
      // A site where yt-dlp gave no stream details: just the quality list.
      for (const id of ["c-type", "c-fmt", "c-codec"]) { $(id).parentElement.hidden = true; $(id).parentElement.previousElementSibling.hidden = true; }
      setOptions($("c-qs"), info.qualities.map((q, i) => [String(i), `${q.label}${q.size ? ` · ${bytes(q.size)}` : ""}`]));
      const preferred = info.qualities.findIndex((q) => /^\d+p/.test(q.label) && parseInt(q.label) <= 1080);
      $("c-qs").value = String(Math.max(0, preferred));
    } else {
      $("c-type").querySelector('[value="audio"]').hidden = !audios().length;
      fillFormats(); fillCodecs(); fillQualities();
      $("c-type").onchange = () => { fillFormats(); fillCodecs(); fillQualities(); refresh(); };
      $("c-fmt").onchange = () => { fillCodecs(); fillQualities(); refresh(); };
      $("c-codec").onchange = () => { fillQualities(); refresh(); };
    }
    $("c-qs").onchange = refresh;
    if (info.subtitles?.length) {
      const tag = (s) => `${s.name}${s.auto ? " (auto-generated)" : ""}`;
      const manual = info.subtitles.filter((s) => !s.auto);
      $("c-sub").innerHTML = `<option value="">None</option>` + info.subtitles.map((s) => `<option value="${esc(s.code)}">${esc(tag(s))}</option>`).join("") +
        (manual.length > 1 ? `<option value="all,-live_chat">All languages (${manual.length})</option>` : "");
      $("c-sub").onchange = refresh;
      $("c-embed").onchange = refresh;
      $("c-subk").hidden = $("c-subv").hidden = false;
    }
    $("c-v").innerHTML = `<option value="">None (audio only)</option>` + videos().map((s) => `<option value="${esc(s.id)}">${esc(vLabel(s))}</option>`).join("");
    $("c-a").innerHTML = `<option value="">None</option>` + audios().map((s) => `<option value="${esc(s.id)}">${esc(aLabel(s))}</option>`).join("");
    $("c-v").onchange = () => {
      const v = videos().find((s) => s.id === $("c-v").value);
      // A ready-made file carries its own sound; otherwise offer the best audio.
      if (v && v.kind === "both") $("c-a").value = "";
      else if (v && !$("c-a").value) $("c-a").value = (best(audios().filter((s) => s.ext === "m4a")) || best(audios()))?.id || "";
      $("c-a").disabled = !!v && v.kind === "both";
      refresh();
    };
    $("c-a").onchange = refresh;
    $("c-ct").onchange = refresh;
    $("c-more").hidden = legacy;
    $("c-more").onclick = () => {
      if (!adv) {
        // Start from what the simple choice would download.
        const p = simplePick();
        $("c-v").value = p.v?.id || "";
        $("c-a").value = p.a?.id || "";
        $("c-a").disabled = !!p.v && p.v.kind === "both";
        $("c-ct").value = ["mp4", "mkv", "webm"].includes(p.ext) ? p.ext : "mp4";
      }
      adv = !adv;
      $("c-adv").hidden = !adv;
      $("c-simple").querySelectorAll("select").forEach((s) => (s.disabled = adv));
      if (!adv) fillCodecs();
      $("c-more").innerHTML = `${icon(adv ? "chevUp" : "chevDown")}${adv ? "Fewer options" : "All formats"}`;
      refresh();
    };
    refresh();
    $("c-start").focus();
  } catch (e) {
    $("c-name").value = "";
    $("c-q").innerHTML = `<span class="err">${esc(String(e))}</span>`;
  } finally {
    clearTimeout(slow);
    $("c-first").hidden = true;
  }
  const add = async (start) => {
    const filename = safeName($("c-name").value);
    const p = info && pick();
    if (!filename || !p?.ok) return;
    const id = await addDownload({ url: inc.url, filename, dir, headers, start, window: win?.label, format: p.format, subtitles: subs(), size: p.size ?? null });
    if (id == null) return;
    invoke("forget_confirm", { token });
    if (!start) { $("w-close").click(); return; }
    history.replaceState(null, "", `?id=${id}`);
    progressView(id);
  };
  $("c-later").onclick = () => add(false);
  $("c-start").onclick = () => add(true);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && !$("c-start").disabled && !e.target.matches("select")) { e.preventDefault(); $("c-start").click(); } });
}

// ---------- New download from a torrent or magnet link ----------
// The torrent is read for its files; the user picks which to download.
async function torrentView(token, inc, settings, headers) {
  let dir = settings.downloadDir, info = null;
  const magnet = inc.url.startsWith("magnet:");
  view.innerHTML = `
    <div class="d-head">${glyph("Torrents")}<div class="d-name"><input id="c-name" spellcheck="false" placeholder="${magnet ? "Asking peers for the details…" : "Reading the torrent…"}" readonly><div class="d-sub"><span class="st">${magnet ? "Magnet link" : "Torrent"}</span></div></div></div>
    <div class="t-files" id="t-files"><div class="t-wait"><span class="spinner"></span><span class="muted">${magnet ? "Finding peers who share it. This can take a few seconds." : "Reading the file list…"}</span></div></div>
    <div class="kv">
      <span class="k">Selected</span><span class="v" id="t-sel">—</span>
      <span class="k">Save to</span><span class="v"><span class="path" id="c-dir" title=""></span><button class="btn sm" id="c-browse">Change</button></span>
    </div>
    <div class="d-foot">
      <button class="btn" id="c-later" disabled>Download later</button>
      <span class="grow"></span>
      <button class="btn" id="c-cancel">Cancel</button>
      <button class="btn primary" id="c-start" disabled>Start download</button>
    </div>`;
  const setDir = (d) => { dir = d; $("c-dir").textContent = d; $("c-dir").title = d; };
  setDir(dir);
  const chosen = () => [...view.querySelectorAll(".t-file input[data-i]:checked")].map((c) => Number(c.dataset.i));
  const update = () => {
    const sel = chosen(), size = sel.reduce((a, i) => a + info.files[i].size, 0);
    $("t-sel").textContent = `${sel.length} of ${info.files.length} file${info.files.length === 1 ? "" : "s"} · ${bytes(size)}`;
    $("c-start").disabled = $("c-later").disabled = sel.length === 0;
    const all = $("t-all"); if (all) all.checked = sel.length === info.files.length;
  };
  try {
    info = await invoke("probe_torrent", { url: inc.url, headers });
    $("c-name").value = info.name;
    const many = info.files.length > 1;
    $("t-files").innerHTML = (many ? `<label class="t-file t-allrow"><input type="checkbox" id="t-all" checked><span>All files</span><span class="muted">${bytes(info.size)}</span></label>` : "") +
      info.files.map((f, i) => `<label class="t-file"><input type="checkbox" data-i="${i}" checked><span title="${esc(f.path)}">${esc(f.path)}</span><span class="muted">${bytes(f.size)}</span></label>`).join("");
    $("t-files").addEventListener("change", (e) => {
      if (e.target.id === "t-all") view.querySelectorAll(".t-file input[data-i]").forEach((c) => (c.checked = e.target.checked));
      update();
    });
    update();
    $("c-start").focus();
  } catch (e) {
    $("t-files").innerHTML = `<div class="t-wait"><span class="err">${esc(String(e))}</span></div>`;
  }
  $("c-browse").onclick = async () => { const d = await invoke("pick_folder", { start: dir }); if (d) setDir(d); };
  $("c-cancel").onclick = () => { invoke("forget_confirm", { token }); $("w-close").click(); };
  const add = async (start) => {
    if (!info) return;
    const sel = chosen();
    if (!sel.length) return;
    const files = sel.length === info.files.length ? [] : sel;
    const size = sel.reduce((a, i) => a + info.files[i].size, 0);
    const id = await addDownload({ url: inc.url, filename: info.name, dir, headers, start, window: win?.label, size, torrentFiles: files });
    if (id == null) return;
    invoke("forget_confirm", { token });
    if (!start) { $("w-close").click(); return; }
    history.replaceState(null, "", `?id=${id}`);
    progressView(id);
  };
  $("c-later").onclick = () => add(false);
  $("c-start").onclick = () => add(true);
}

// ---------- progress / complete ----------
let current = null, details = false, armedTimer = 0, unlisten = null;
async function progressView(id) {
  current = await invoke("get_item", { id });
  render();
  unlisten?.();
  unlisten = await listen("downloads", (e) => {
    const it = e.payload.find((i) => i.id === id);
    if (!it) { $("w-close").click(); return; }
    current = it;
    render();
  });
}

let layout = "";
function render() {
  const it = current;
  if (!it) return;
  const cat = Array.isArray(it.torrentFiles) ? "Torrents" : it.category || catOf(it.filename);
  const pct = it.size ? Math.min(100, (it.downloaded / it.size) * 100) : it.status === "completed" ? 100 : 0;
  const eta = it.speed > 0 && it.size ? (it.size - it.downloaded) / it.speed : Infinity;

  // One card for every state; only the status line, bar colour, stats and
  // buttons change, so finishing a download feels like the same window.
  const state = it.status === "completed" ? "done" : it.status === "error" ? "error" : it.status === "downloading" ? "run" : "paused";
  const paused = state === "paused";
  const torrent = Array.isArray(it.torrentFiles);
  const media = !!it.format || torrent;
  const showDetails = details && !media && (state === "run" || state === "paused");
  const key = `${state}:${showDetails}`;
  if (layout !== key) {
    layout = key;
    const buttons = {
      run: `<button class="btn" data-a="cancel">Cancel</button><button class="btn" data-a="pause">Pause</button>`,
      paused: `<button class="btn" data-a="cancel">Cancel</button><button class="btn primary" data-a="resume">Resume</button>`,
      done: `<button class="btn" data-a="folder">Show in folder</button><button class="btn" data-a="close">Close</button><button class="btn primary" data-a="open">Open</button>`,
      error: `<button class="btn" data-a="close">Close</button><button class="btn primary" data-a="resume">Retry</button>`,
    }[state];
    view.innerHTML = `
      <div class="d-head">${glyph(cat)}<div class="d-name"><b title="${esc(it.filename)}">${esc(it.filename)}</b><div class="d-sub" id="p-sub"></div></div></div>
      <div class="p-line"><div class="p-bar" id="p-bar"><i></i></div><span class="p-pct" id="p-pct"></span></div>
      <div class="p-meta"><span id="p-left"></span><span id="p-right"></span></div>
      <div class="kv" id="p-kv"></div>
      ${showDetails ? `<div class="conn"><div class="conn-head"><b>Connections</b><span id="p-conn-n"></span></div><div class="lanes" id="p-lanes"></div>
        <div class="cscroll"><table class="ctable"><thead><tr><th>#</th><th>Downloaded</th><th>Progress</th><th>Status</th></tr></thead><tbody id="p-rows"></tbody></table></div></div>` : ""}
      <div class="d-foot">
        ${!media && (state === "run" || state === "paused") ? `<button class="ghost-btn" data-a="details">${icon(showDetails ? "chevUp" : "chevDown")}${showDetails ? "Hide details" : "Show details"}</button>` : ""}
        <span class="grow"></span>${buttons}
      </div>`;
  }

  const dir = it.path.replace(/[\\/][^\\/]*$/, "");
  const status = {
    run: [it.note || (media ? (it.downloaded ? "Downloading" : "Starting…") : it.connections ? `Downloading · ${it.connections} connection${it.connections === 1 ? "" : "s"}` : "Connecting…"), "var(--accent)"],
    paused: [it.status === "queued" ? "Waiting in queue" : "Paused", "var(--amber)"],
    done: ["Completed", "var(--green)"],
    error: [it.error || "Failed", "var(--red)"],
  }[state];
  setTitle(state === "done" ? "Download complete" : state === "error" ? "Download failed" : `${Math.floor(pct)}% · ${it.filename}`);
  $("p-sub").innerHTML = `<span class="st ${state === "error" ? "err" : ""}" title="${esc(status[0])}">${esc(status[0])}</span><span>·</span><span>${esc(host(it.url))}</span>`;
  $("p-pct").textContent = it.size || state === "done" ? `${Math.floor(pct)}%` : "";
  $("p-left").textContent = state === "done" ? bytes(it.size) : it.size ? `${bytes(it.downloaded)} of ${bytes(it.size)}` : bytes(it.downloaded);
  $("p-right").textContent = state === "run" ? `${speed(it.speed)} · ${dur(eta)} left` : state === "done" ? when(it.completedAt) : "";
  const bar = $("p-bar");
  bar.className = `p-bar ${state} ${!it.size && state === "run" ? "indet" : ""}`;
  bar.firstElementChild.style.width = `${pct}%`;
  const row = (k, v, cls = "") => `<span class="k">${k}</span><span class="v"><span class="${cls}" title="${esc(v)}">${esc(v)}</span></span>`;
  const kv = row("Location", dir, "path") +
    (state === "done" ? "" : torrent ? row("Files", it.torrentFiles.length ? `${it.torrentFiles.length} selected` : "All") : media ? row("Quality", qualityLabel(it.format)) : row("Resume", it.resumable ? "Supported" : "Not supported by this server")) +
    row("Address", it.url);
  if ($("p-kv").innerHTML !== kv) $("p-kv").innerHTML = kv;

  if (showDetails) {
    const size = it.size || 1;
    const segs = (it.segments || []).filter(([s, , e]) => e > s);
    $("p-conn-n").textContent = segs.length ? `${segs.filter(([, p, e]) => p < e).length} active · ${segs.length} parts` : "";
    // Start positions and progress by connection, IDM style: each part of
    // the file is a slot, separated by a small gap, filled as it arrives.
    const lanes = $("p-lanes");
    lanes.className = `lanes ${paused ? "paused" : ""}`;
    const html = segs.map(([s, p, e]) =>
      `<span class="slot" style="left:calc(${(s / size) * 100}% + 1px);width:calc(${((e - s) / size) * 100}% - 2px)"><i style="width:${((p - s) / Math.max(1, e - s)) * 100}%"></i></span>`).join("");
    if (lanes.children.length !== segs.length) lanes.innerHTML = html;
    else segs.forEach(([s, p, e], i) => {
      const slot = lanes.children[i];
      slot.style.left = `calc(${(s / size) * 100}% + 1px)`;
      slot.style.width = `calc(${((e - s) / size) * 100}% - 2px)`;
      slot.firstElementChild.style.width = `${((p - s) / Math.max(1, e - s)) * 100}%`;
    });
    $("p-rows").innerHTML = segs.map(([s, p, e], n) => {
      const done = p >= e, frac = (p - s) / Math.max(1, e - s);
      return `<tr><td>${n + 1}</td><td>${bytes(p - s)}</td><td><span class="mini"><i style="width:${frac * 100}%"></i></span></td><td class="${done ? "ok" : paused ? "" : "live"}">${done ? "Done" : paused ? "Paused" : "Receiving data…"}</td></tr>`;
    }).join("") || `<tr><td colspan="4" class="muted">Connection details appear once the download starts.</td></tr>`;
  }
}

function qualityLabel(format) {
  const h = /height=(\d+)/.exec(format || "");
  if (h) return `${h[1]}p`;
  if (/^ba/.test(format || "")) return "Audio only";
  return /^[\w-]+(\+[\w-]+)?$/.test(format || "") ? `Format ${format}` : "Best available";
}

view.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a]");
  if (!b || !current) return;
  const id = current.id;
  switch (b.dataset.a) {
    case "details": details = !details; render(); break;
    case "pause": invoke("pause", { ids: [id] }); break;
    case "resume": layout = ""; invoke("resume", { ids: [id] }); break;
    case "open": invoke("open_file", { id }); $("w-close").click(); break;
    case "folder": invoke("open_folder", { id }); break;
    case "close": $("w-close").click(); break;
    case "cancel":
      // Ask twice instead of a second dialog: the button arms for 3 s.
      if (!b.classList.contains("armed")) {
        b.classList.add("armed"); b.textContent = "Cancel download?";
        clearTimeout(armedTimer);
        armedTimer = setTimeout(() => { b.classList.remove("armed"); b.textContent = "Cancel"; }, 3000);
      } else {
        await invoke("remove", { ids: [id], deleteFiles: false });
        $("w-close").click();
      }
      break;
  }
});

// Theme: the saved choice, and any change made in Settings while open.
invoke("get_state").then((s) => window.setTheme(s.settings.theme)).catch(() => {});
listen("settings", (e) => window.setTheme(e.payload.theme));

if (params.has("confirm")) confirmView(Number(params.get("confirm")));
else if (params.has("id")) progressView(Number(params.get("id")));
