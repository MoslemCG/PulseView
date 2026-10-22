# Third-party notices and asset scope

## Original project material

The application glue, frontend, SVG icons, generated pulse app icon, tests and project documentation are provided under the root MIT license. No third-party frontend runtime library or web font is bundled. CSS references installed system fonts; no font file is distributed. Actual frontend screenshots show the project's UI using simulated preview telemetry.

`docs/design/reference.png` and `docs/design/chart-target.png` are **user-supplied visual design references** retained locally for project fidelity (the second is a previously supplied mockup, not a screenshot of this code). They are excluded from the project's MIT grant, Git and public source archives. No ownership or redistribution permission beyond the supplied context is asserted. See `docs/design/README.md` for the public visual references. Product/hardware names in labels are descriptive; they do not imply endorsement.

## Build/runtime dependencies (not in this source archive)

| Component | Role / license handling |
|---|---|
| Microsoft.Web.WebView2 SDK 1.0.3537.50 | Headers/static loader downloaded during configure or supplied offline. Governed by the package's Microsoft license. Preserve the original license files. |
| Microsoft Edge WebView2 Evergreen Runtime | Separately installed runtime. Governed by Microsoft distribution terms; not silently installed or bundled here. |
| Microsoft Visual C++ runtime | Runtime prerequisite for the MSVC build; distribute/install under Microsoft's terms. |
| nlohmann/json 3.12.0 | MIT-licensed C++ header downloaded during configure. Its copyright/license must accompany distributions containing the library. CMake downloads its LICENSE.MIT for online builds. |
| NVIDIA NVML | Optional dynamically loaded driver-provided DLL. No NVML binary, driver or SDK header is included. The source contains minimal original read-only ABI declarations. NVIDIA's terms apply to its installed components. |

The package staging script copies discovered WebView2 license files and the online-downloaded json license. For **offline dependency paths**, the packager must ensure all applicable upstream notices are in the staged `licenses` folder before release. A source archive with download instructions is not a license grant to redistribute third-party binaries arbitrarily.

## Optional developer/test tools

CMake, Visual Studio/Windows SDK, Node.js, Python, TypeScript and Playwright are development/test tools installed separately. Their packages and browsers are not bundled in the source ZIP. The browser test bundler is test-only; production serves the original JS modules. The GitHub Actions workflow invokes externally maintained actions when run by the repository owner.

Upstream links and consulted API references are in `docs/SOURCES.md`. Verify packaging obligations against the actual dependency artifacts used for a release.
