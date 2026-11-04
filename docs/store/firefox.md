# Firefox Add-ons listing

Everything the submission form on addons.mozilla.org asks for, ready to
paste. Keep it up to date when the add-on changes.

**Add-on ID:** `swiftdl@sailhighsea` (fixed; set by `app/src-tauri/build.rs`)
**Upload:** `swiftdl-firefox.xpi` from a release, or build it locally (the
installer build writes `app/src-tauri/gen/extension-firefox/`; zip its
contents).

---

## Listing

**Name**

SwiftDL Integration

**Summary** (250 characters max)

Sends your downloads to SwiftDL, the free and open-source download manager, for faster multi-connection downloads that resume after anything. Adds a download button to videos and sends magnet links to SwiftDL.

**Description**

SwiftDL Integration connects Firefox to **SwiftDL**, a free and open-source
download manager for Windows, macOS and Linux.

Browsers download every file over a single connection. SwiftDL splits each
file across up to 32 connections and keeps all of them busy, so downloads from
servers that limit each connection finish many times faster. Progress is saved
every second, so a crash, a closed laptop or a dropped connection never means
starting over.

What the add-on does:

- Sends downloads you start in Firefox to SwiftDL, with the site's cookies, so
  downloads behind a login keep working.
- Adds a Download video button to video players. On YouTube and other video
  sites, pick a quality in SwiftDL, from 4K to audio only.
- Sends magnet links and .torrent files to SwiftDL's built-in torrent client.
- Hold Alt while clicking a link to let Firefox download it instead, or turn
  SwiftDL off for a single site from the toolbar button.

**Requires the SwiftDL desktop app**, free from
https://swiftdl.harshhh.me. The add-on talks only to the app on your own
computer (native messaging); nothing is sent to any server.

Open source (MIT): https://github.com/harshsinghsv/swiftdl

**Categories:** Download Management

**Tags:** download manager, downloads, download accelerator, video downloader, torrent

**Support email or website:** https://github.com/harshsinghsv/swiftdl/issues

**Homepage:** https://swiftdl.harshhh.me

**License:** MIT License

**Does this add-on require payment, non-free services or software, or
additional hardware?** No. (It needs the SwiftDL desktop app, which is free
and open source.)

---

## Privacy policy

SwiftDL Integration does not collect, store or send personal data to the
developer or to any third party.

When you start a download, the add-on passes the download's address, the page
it came from, the site's cookies for that address and your browser's user agent
to the SwiftDL desktop app running on your own computer, through Firefox's
native messaging. SwiftDL uses them only to download that file and deletes the
cookies when the download completes. The add-on also notes which video and
audio files a page loads, kept in memory for the current session, to offer them
in its video button.

Nothing leaves your computer except the requests SwiftDL makes to download the
files you chose. There are no analytics, accounts or telemetry.

---

## Notes to reviewer

SwiftDL Integration is the browser half of SwiftDL, an open-source desktop
download manager (https://github.com/harshsinghsv/swiftdl). The add-on's code
is in `extension/`; it is plain JavaScript with no build step, minification or
remote code, so the uploaded files are the source.

Why each permission is needed:

- `nativeMessaging`: hands downloads to the SwiftDL desktop app
  (host `com.swiftdl.host`). This is the add-on's core purpose.
- `downloads`: notices downloads started in Firefox, pauses them and cancels
  the Firefox copy once SwiftDL has taken over (or resumes it if the app isn't
  available).
- `cookies` and `<all_urls>`: reads the cookies for the download's own address
  so downloads behind a login work in SwiftDL. They are passed only to the
  local app.
- `webRequest`: watches responses for video and audio files so the video
  button can list them. Non-blocking; nothing is modified.
- `contextMenus`: adds "Download with SwiftDL" to links and media.
- `storage`: the add-on's settings (on/off, per-site switch, size threshold)
  and the per-tab list of media found.

The content script (`content.js`) shows the video button in a closed shadow
root and sends magnet-link clicks to the app. `innerHTML` is only used to build
the add-on's own markup from escaped values.

To test: install SwiftDL for Windows, macOS or Linux from
https://github.com/harshsinghsv/swiftdl/releases/latest and open it once (it
registers the native messaging host for Firefox). Then start any download in
Firefox: SwiftDL opens a "New download" window. Without the app, the add-on
leaves downloads to Firefox and its popup says SwiftDL can't be reached.

Data collection is declared as `none`: everything the add-on reads goes only
to the app on the same computer.
