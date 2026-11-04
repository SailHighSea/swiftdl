//! Start SwiftDL when the user signs in, hidden in the tray.

use anyhow::Result;

/// Passed on the command line by the sign-in entry so the window stays hidden.
pub const HIDDEN_ARG: &str = "--hidden";

fn exe() -> Result<std::path::PathBuf> {
    // An AppImage runs from a temporary mount; $APPIMAGE is the file itself.
    Ok(std::env::var_os("APPIMAGE").map(std::path::PathBuf::from).map_or_else(std::env::current_exe, Ok)?)
}

#[cfg(windows)]
pub fn set(enabled: bool) -> Result<()> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    let run = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_SET_VALUE)?;
    if enabled {
        run.set_value("SwiftDL", &format!("\"{}\" {HIDDEN_ARG}", exe()?.display()))?;
    } else {
        let _ = run.delete_value("SwiftDL");
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn set(enabled: bool) -> Result<()> {
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from).ok_or_else(|| anyhow::anyhow!("no home folder"))?;
    let agents = home.join("Library/LaunchAgents");
    let file = agents.join("com.swiftdl.app.plist");
    if enabled {
        std::fs::create_dir_all(&agents)?;
        let exe = exe()?.to_string_lossy().replace('&', "&amp;").replace('<', "&lt;");
        std::fs::write(
            file,
            format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<plist version=\"1.0\"><dict>\n<key>Label</key><string>com.swiftdl.app</string>\n\
                 <key>ProgramArguments</key><array><string>{exe}</string><string>{HIDDEN_ARG}</string></array>\n\
                 <key>RunAtLoad</key><true/>\n</dict></plist>\n"
            ),
        )?;
    } else {
        let _ = std::fs::remove_file(file);
    }
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn set(enabled: bool) -> Result<()> {
    let dir = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".config")))
        .ok_or_else(|| anyhow::anyhow!("no home folder"))?
        .join("autostart");
    let file = dir.join("swiftdl.desktop");
    if enabled {
        std::fs::create_dir_all(&dir)?;
        let exec = exe()?.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
        std::fs::write(
            file,
            format!("[Desktop Entry]\nType=Application\nName=SwiftDL\nExec=\"{exec}\" {HIDDEN_ARG}\nIcon=swiftdl\nTerminal=false\nX-GNOME-Autostart-enabled=true\n"),
        )?;
    } else {
        let _ = std::fs::remove_file(file);
    }
    Ok(())
}
