# Build the installer locally and copy it, with the Firefox add-on files, into
# test/ (not tracked by git). Run from the repo root:  .\tools\test-build.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

Push-Location app/src-tauri
# The CLI logs progress on stderr, which PowerShell 5.1 would treat as errors.
$ErrorActionPreference = "Continue"
npx --yes @tauri-apps/cli@2 build
if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
$ErrorActionPreference = "Stop"
Pop-Location

$out = "test"
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $out | Out-Null

# Installers (.exe, .msi) land under the workspace target folder.
Get-ChildItem target/release/bundle -Recurse -Include *.exe, *.msi |
    Copy-Item -Destination $out

# Portable copy: the program plus an empty "portable" file, which makes it
# keep its settings, downloads list and tools in a data folder beside it.
$portable = "$out/SwiftDL-portable"
New-Item -ItemType Directory $portable | Out-Null
Copy-Item target/release/swiftdl-app.exe "$portable/SwiftDL.exe"
New-Item -ItemType File "$portable/portable" | Out-Null
Copy-Item extension "$portable/extension" -Recurse
Copy-Item app/src-tauri/gen/extension-firefox "$portable/extension-firefox" -Recurse
Compress-Archive "$portable/*" "$out/SwiftDL-portable.zip" -Force

# The unsigned Firefox add-on, for loading by hand (about:debugging, "Load
# Temporary Add-on") and the Chromium extension.
Copy-Item app/src-tauri/gen/extension-firefox "$out/extension-firefox" -Recurse -ErrorAction SilentlyContinue
Copy-Item extension "$out/extension" -Recurse

Get-ChildItem $out
