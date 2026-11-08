// Runs inside YouTube's own page (not the extension's sandbox), because only
// there can it see the player's data. When content.js asks, it answers with
// the formats YouTube already sent for the current video, which lets SwiftDL
// show every quality at once instead of looking the video up again.
(() => {
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.swiftdl !== "yt-ask") return;
    let r = null;
    try {
      r = document.getElementById("movie_player")?.getPlayerResponse?.() || window.ytInitialPlayerResponse || null;
    } catch { r = null; }
    const id = new URLSearchParams(location.search).get("v") || (location.pathname.match(/\/shorts\/([\w-]+)/) || [])[1];
    // After moving to another video the old answer can linger for a moment.
    if (!r || (id && r.videoDetails?.videoId !== id)) r = null;
    const formats = (r?.streamingData?.adaptiveFormats || []).map((f) => ({
      mime: f.mimeType || "", height: f.height || 0, fps: f.fps || 0, bitrate: f.bitrate || 0, size: Number(f.contentLength) || 0,
    }));
    window.postMessage({ swiftdl: "yt-info", id: r?.videoDetails?.videoId || null, title: r?.videoDetails?.title || "", live: !!r?.videoDetails?.isLive, formats }, "*");
  });
})();
