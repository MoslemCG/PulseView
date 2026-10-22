# Building PulseView on Windows 11 x64

### Prerequisites

Install **Visual Studio 2022 or Build Tools 2022**, with **Desktop development with C++**, MSVC v143, a Windows 11 SDK **10.0.22621 or newer**, and **CMake 3.24+**. The supplied preset uses the Visual Studio 17 2022 generator and x64 architecture.

Install the **Microsoft Edge WebView2 Evergreen x64 Runtime** if it is missing. The SDK is a build dependency; the Runtime is a separate execution dependency. Windows installations frequently already have the Runtime, but the app does not assume that it is always present. Distribution references are in [SOURCES.md](SOURCES.md).

Node.js is **not required to build or run the Windows app**. Node 20+ is used only for frontend model tests and regenerating metric definitions. Python/Playwright/TypeScript are optional UI-test tools.

### Straightforward build

Open PowerShell in the project root:

```powershell
cmake --preset windows-x64
cmake --build --preset release --parallel
ctest --preset windows-release
.\out\build\windows-x64\bin\Release\PulseView.exe
```

Or use the convenience script:

```powershell
.\scripts\build.ps1 -Configuration Release -Run
```

The first configure downloads these pinned developer dependencies over HTTPS:

| Dependency | Version | Usage |
|---|---|---|
| Microsoft.Web.WebView2 | 1.0.3537.50, deliberately pinned stable SDK | C++ headers and x64 static loader |
| nlohmann/json | 3.12.0 | JSON parsing, validation and serialization |

They are cached beneath `out/build/windows-x64/_deps`. They are **not bundled into this source archive**. Build-time network access to NuGet and GitHub is needed unless offline dependency paths are supplied. No Node/npm installation or CDN assets are needed for the frontend. The WebView2 SDK pin is not a claim that this is the newest release.

Keep the complete `ui` folder beside `PulseView.exe`. CMake copies it on every build, including HTML/CSS-only changes. The app maps that folder to a private local virtual HTTPS origin; it does not launch a browser tab or listen on a TCP port.

For a Debug build:

```powershell
cmake --build --preset debug --parallel
.\scripts\run.ps1 -Configuration Debug
```

The Release host disables DevTools and browser menus. Debug permits DevTools through WebView2 debugging APIs; the app still suppresses browser accelerators. The browser preview is usually easier for CSS development.

### Offline dependency setup

On a connected machine, obtain the exact WebView2 NuGet package and extract it as a ZIP. The extraction must contain:

```text
build/native/include/WebView2.h
build/native/x64/WebView2LoaderStatic.lib
```

Obtain nlohmann/json 3.12.0's single header and license. Use a folder whose layout is `include/nlohmann/json.hpp`. Then configure:

```powershell
cmake --preset windows-x64 `
  -DPULSEVIEW_ALLOW_DOWNLOADS=OFF `
  -DPULSEVIEW_WEBVIEW2_DIR="C:/deps/webview2-1.0.3537.50" `
  -DPULSEVIEW_JSON_INCLUDE_DIR="C:/deps/json-3.12.0/include"
cmake --build --preset release --parallel
```

Keep the upstream dependency licenses for redistribution. Do not disable TLS verification to work around a failed download. Proxy/DNS/firewall problems are build-environment issues; they do not require changing the local UI architecture.

### Create an application ZIP after a successful build

```powershell
.\scripts\package.ps1 -Configuration Release
```

Output: `out/PulseView-Portable-x64.zip`, containing the executable, local UI and
app-local Microsoft C++ runtime DLLs. WebView2 Evergreen x64 Runtime is required.
To build Setup, install Inno Setup 6 and run `scripts/build-installer.ps1` after
packaging. It downloads Microsoft's signed WebView2 bootstrapper over HTTPS and
produces `out/PulseView-Setup-x64.exe` plus `out/SHA256SUMS.txt`. Setup installs
WebView2 only when missing. Code signing and automatic app updates are not included.

## Versions and releases

`package.json` is the version authority. After changing it, run
`node scripts/sync-version.mjs` and commit `ui/core/version.js`. CMake reads the
same version to generate the native resource/header. CI checks synchronization
and rejects release tags that do not match `v<package-version>`.

Pushing a matching version tag runs the Windows build, native tests, packaging
and isolated installer install/uninstall smoke on Windows Server 2025, then
publishes Setup, portable ZIP and SHA256 checksums as GitHub Release assets.
Installer smoke never runs on a developer's real installation.

The GitHub Actions workflow has passed the Windows compile and native unit tests.
Installer smoke is an additional release gate; neither check replaces testing
GPU correctness, DPI and overlay behavior on real hardware.


## Frontend preview and tests

```powershell
npm run setup:git
npm run check
npm test
python scripts/preview.py
```

Browser regressions require TypeScript, Python Playwright and Chromium:

```powershell
npm install --no-save typescript
python -m pip install playwright pillow
python -m playwright install chromium
python tests/browser_test.py
python tests/revision_browser_test.py
```

Preview telemetry is synthetic; native telemetry is never replaced by it.
See [agent.md](../agent.md) for the required checks and [FILE_POLICY.md](FILE_POLICY.md)
for source/output placement. Capture output stays under ignored `out/`.

## Owner's local release

Use the published portable artifact for the owner's normal
`out/build/ninja-release/bin/PulseView.exe`. After publishing a matching version
tag and closing PulseView normally:

```powershell
.\scripts\sync-local-release.ps1
```

The script verifies the release ZIP checksum, backs up the old runtime under
`.local/runtime-backups/`, installs the exact release files and compares their
hashes. AppData presets and settings are preserved. Reopen the same executable
and check About in the actual app. `-VerifyOnly` checks parity without replacing
files. Rebuilding into that directory requires another sync before delivery.
