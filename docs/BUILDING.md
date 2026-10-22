# Building PulseView on Windows 11 x64

### Prerequisites

Install **Visual Studio 2022 or Build Tools 2022**, with **Desktop development with C++**, MSVC v143, a Windows 11 SDK **10.0.22621 or newer**, and **CMake 3.24+**. The supplied preset uses the Visual Studio 17 2022 generator and x64 architecture.

Install the **Microsoft Edge WebView2 Evergreen x64 Runtime** if it is missing. The SDK is a build dependency; the Runtime is a separate execution dependency. Windows installations frequently already have the Runtime, but the app does not assume that it is always present. Distribution references are in [SOURCES.md](docs/SOURCES.md).

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

Output: `out/PulseView-Windows-x64.zip`. This contains the executable and local UI assets, not the source project. End users need the WebView2 Evergreen x64 Runtime and Microsoft Visual C++ x64 runtime required by the MSVC build. The project does not silently install prerequisites. Signing, a branded installer, auto-update and Store/MSIX distribution are outside this source delivery.

The included GitHub Actions workflow performs a Windows compile and unit tests after you push the project to a repository. It has not been run as part of this delivery and is not a substitute for testing on real GPU hardware.


## Frontend preview and tests

See [README.md](../README.md#development) for development commands. Preview telemetry is synthetic; native telemetry is never replaced by it. Browser capture tooling additionally uses Python Pillow.
