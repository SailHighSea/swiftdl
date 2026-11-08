//! A small log file for finding out why SwiftDL misbehaved or crashed.
//!
//! Errors and panics are always written; with "Debug log" on in Settings,
//! ordinary events are written too. The file lives in `<data>/logs/` and is
//! started over once it passes a megabyte (the old one is kept as `.old`).

use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static VERBOSE: AtomicBool = AtomicBool::new(false);
static LOCK: Mutex<()> = Mutex::new(());
const MAX_BYTES: u64 = 1_000_000;

pub fn dir() -> PathBuf {
    crate::browser::data_dir().join("logs")
}

pub fn file() -> PathBuf {
    dir().join("swiftdl.log")
}

pub fn set_verbose(on: bool) {
    VERBOSE.store(on, Ordering::Relaxed);
}

fn write(level: &str, msg: &str) {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = file();
    let _ = std::fs::create_dir_all(dir());
    if std::fs::metadata(&path).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let _ = std::fs::rename(&path, path.with_extension("log.old"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let (h, m, s) = ((secs / 3600) % 24, (secs / 60) % 60, secs % 60);
        let _ = writeln!(f, "[{}d {h:02}:{m:02}:{s:02} UTC] {level:5} {msg}", secs / 86400);
    }
}

/// Only written when the debug log is on.
pub fn info(msg: impl AsRef<str>) {
    if VERBOSE.load(Ordering::Relaxed) {
        write("INFO", msg.as_ref());
    }
}

pub fn error(msg: impl AsRef<str>) {
    eprintln!("{}", msg.as_ref());
    write("ERROR", msg.as_ref());
}

/// Records panics (with where they happened) before the default handler runs.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let backtrace = std::backtrace::Backtrace::force_capture();
        write("PANIC", &format!("thread '{}': {info}\n{backtrace}", thread.name().unwrap_or("?")));
        previous(info);
    }));
    write("INFO", &format!("SwiftDL {} started", env!("CARGO_PKG_VERSION")));
}

/// An ordinary diagnostic line that is always kept (lookups, tool downloads),
/// so a bug report has something to go on without the debug log being on.
pub fn line(msg: &str) {
    write("INFO", msg);
    #[cfg(debug_assertions)]
    eprintln!("{msg}");
}
