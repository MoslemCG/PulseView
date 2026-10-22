# Implementation references

Primary documentation consulted for the source design. These links explain API behavior; they are **not** proof that this particular Windows build has been executed or certified. The SDK version is deliberately pinned, not claimed to be the latest.

## WebView2 / native UI

- Local content and virtual host mappings: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/working-with-local-content
- Composition controller and input forwarding: https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2compositioncontroller?view=webview2-1.0.3537.50
- Threading model and avoiding callback reentrancy: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model
- Script dialog deferrals: https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2scriptdialogopeningeventargs?view=webview2-1.0.3537.50
- Microsoft composition-host sample, consulted for host responsibilities: https://github.com/MicrosoftEdge/WebView2Samples/blob/main/SampleApps/WebView2APISample/ViewComponent.cpp
- DirectComposition effect opacity: https://learn.microsoft.com/en-us/windows/win32/api/dcomp/nf-dcomp-idcompositioneffectgroup-setopacity(float)
- Window features and layered hit testing: https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features
- Monitor information / monitor-name structure: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getmonitorinfow
- Hotkey registration (including F12 reservation): https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey
- WebView2 Runtime deployment: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- Pinned WebView2 SDK: https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3537.50

## Telemetry

- English PDH counter paths: https://learn.microsoft.com/en-us/windows/win32/api/pdh/nf-pdh-pdhaddenglishcounterw
- Performance counter data collection: https://learn.microsoft.com/en-us/windows/win32/perfctrs/using-the-pdh-functions-to-consume-counter-data
- Windows GPU scheduler/memory metrics and busiest-engine semantics: https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/
- Process-scoped DXGI video-memory query: https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/nf-dxgi1_4-idxgiadapter3-queryvideomemoryinfo
- Physical memory information: https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex
- Commit/cache/pool information: https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getperformanceinfo
- Processor topology: https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getlogicalprocessorinformationex
- Interface counters: https://learn.microsoft.com/en-us/windows/win32/api/netioapi/nf-netioapi-getiftable2
- Default route table: https://learn.microsoft.com/en-us/windows/win32/api/netioapi/nf-netioapi-getipforwardtable2
- NVIDIA NVML API: https://docs.nvidia.com/deploy/nvml-api/nvml-api-reference.html
- NVIDIA NVML declarations consulted for read-only ABI compatibility: https://github.com/NVIDIA/nvidia-settings/blob/main/src/nvml.h

## Build dependencies

- nlohmann/json 3.12.0: https://github.com/nlohmann/json/tree/v3.12.0
- CMake presets: https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html

Application source is original glue/UI code. Upstream binaries, SDKs and documentation retain their own licenses. See `../THIRD_PARTY_NOTICES.md`.

## Chart/input revision (1.1.0, reviewed 26 September 2026)

- Browser non-primary click event and preventing middle-button default actions: https://developer.mozilla.org/en-US/docs/Web/API/Element/auxclick_event
- Mouse button identifiers: https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
- Canvas linear gradient coordinate system: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/createLinearGradient

The composition-controller reference above remains the authority for forwarding native middle-button input. Documentation consultation does not establish that the native host was tested on Windows.
