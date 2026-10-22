# Metric meanings, providers and limitations

These are implementation contracts, not a claim that every driver exposes every reading. The base catalog is defined in `ui/core/catalog.js`; the C++ header is generated from it. Additional device-specific rows are discovered at runtime. Missing or invalid measurements are `null`, displayed as `—` and graph gaps. A genuine measured zero is distinct.

## CPU

| Metric | Source / interpretation |
|---|---|
| `cpu.usage` | PDH `Processor Information(_Total)\% Processor Time`; time-based utilization. |
| `cpu.utility` | PDH `% Processor Utility`; separate frequency-aware counter, not an alias for Processor Time. |
| `cpu.frequency` | PDH `Processor Frequency`, MHz. It is not guaranteed to equal a vendor's instantaneous peak clock. |
| `cpu.logical.<group>.<index>` | One PDH `Processor Information(group,index)\% Processor Time` reading per logical processor. |

The CPU bundle renders every discovered logical processor, with an internal scroll fallback if necessary. Physical-core count and logical-processor count are separate topology metadata. It does not pretend one SMT thread is one physical core. The counter path supports Windows processor groups; do not replace it with a single `GetSystemTimes` reading and claim individual-thread coverage.

Task Manager numbers may differ because definitions, averaging intervals and frequency normalization differ. The portable `CpuBusy` math helper documents the `GetSystemTimes` convention that kernel includes idle, but the production per-logical-processor collector uses PDH. CPU temperature and motherboard sensors are not implemented.

## System memory

`GlobalMemoryStatusEx` supplies total and available physical memory. `memory.used` is total minus available; this is not a byte-for-byte recreation of every Task Manager memory subcategory. `GetPerformanceInfo` supplies page-based commit, commit limit, system cache and kernel pools, multiplied by page size.

The catalog exposes used, available, total, percent, committed bytes, commit limit/percent, cache, paged pool and nonpaged pool. Cache is the API's system-cache statistic; do not relabel it as exactly Task Manager's standby/modified combination. Commit is a virtual-memory commitment, not physical RAM usage. Raw units are bytes; UI can display GiB, MiB or decimal GB.

## GPU engines: WDDM

DXGI discovers hardware adapters/capacities and runtime LUIDs. PDH `GPU Engine(*)\Utilization Percentage` supplies process/engine instances. Process contributions for the **same physical engine** are combined first. Aggregate GPU activity is the **busiest engine**, not the mean or sum of unrelated engines. Values are clamped to valid utilization bounds after aggregation.

Available families include overall, 3D, Compute, CUDA, Copy, Video Encode, Video Decode and Video Processing, plus individually discovered engines. An aggregate family uses the busiest matching engine; it does not assert that those engines can all execute independently. Driver engine names and scheduling models can vary. The parser and comparison against a current Task Manager build need real-hardware acceptance.

**`gpu.compute` is not automatically `gpu.cuda`.** CUDA is only populated when the driver exposes a CUDA-named engine. Many NVIDIA driver/workload combinations expose compute under another name and cannot provide an isolated CUDA percentage through this path. In that case the CUDA widget stays unavailable; use explicitly labelled Compute or NVIDIA GPU Activity instead. Do not put NVML general busy into CUDA merely to avoid an empty chart. No Tensor/RT/SM occupancy collector is provided.

The default GPU aliases choose the discovered adapter with the largest dedicated memory. Specific adapters and engines have explicit IDs. Adapter identity is based on the hardware descriptor tuple plus duplicate occurrence, with LUID used for current-session counter matching. This is not a hardware serial number: two otherwise identical adapters can be reordered across driver/hardware changes. A more durable identity migration must preserve existing presets and be tested before adoption.

## VRAM and shared GPU memory

`GPU Adapter Memory(*)\Dedicated Usage` and `Shared Usage` are whole-adapter WDDM counters. DXGI dedicated/shared capacity supplies limits. `gpu.vram.used`, `.percent`, `.total`, `.free`, `gpu.shared.used`, `.total` are separate metrics. Headroom is capacity minus usage, **not** an allocation guarantee or residency budget.

`IDXGIAdapter3::QueryVideoMemoryInfo` reports usage for the calling process; using it alone for total system VRAM would be incorrect. This implementation deliberately does not use it for the global VRAM plot. Shared memory is not added to dedicated VRAM as if it were the same physical resource. Missing WDDM counters produce unavailable readings, not simulated NVML allocation estimates.

## Optional NVIDIA NVML

The application loads the installed NVIDIA/System32 `nvml.dll` dynamically from controlled absolute paths. It does not ship a DLL, install a driver, download runtime code, change GPU settings or require the CUDA Toolkit for building the app. Minimal read-only ABI declarations live in `Nvml.*`.

Exposed when supported: overall GPU busy, memory-controller busy, GPU temperature, board power, fan percentage, graphics clock, memory clock, encoder and decoder utilization. **Memory-controller busy is not the percentage of VRAM allocated.** Overall busy is not isolated CUDA activity. Sensor availability depends on device/driver and return codes. No junction/hotspot/CPU temperature is synthesized.

Explicit NVML device IDs derive from UUIDs in their own `nvidia.device.*` namespace. Default NVIDIA aliases refer to the first enumerated NVML device; that need not be the same device chosen by the default DXGI GPU alias on a multi-GPU computer. The UI labels devices; select explicit IDs when comparing. Do not merge namespaces by enumeration index.

## Network

IP Helper `GetIfTable2` provides interface octet counters, operational state and link speeds. Traffic rates use `(newBytes - oldBytes) / actualElapsedSeconds`, not an assumed polling duration. First sample, reset counters or invalid elapsed time result in unavailable rate readings. No unsigned-wrap spikes are fabricated.

Default aliases follow the lowest-metric connected default IPv4 route, then IPv6, with a fallback to an up hardware interface. Explicit interface IDs derive from the interface GUID. All non-loopback interfaces are discoverable, including virtual/VPN adapters where returned by Windows. Down interfaces remain distinguishable from an active connection carrying zero traffic.

Download/upload are interface receive/transmit rates. They can include LAN traffic, VPN encapsulation or traffic from every application; this is not Internet-only or per-process accounting. Received/sent totals are interface counters and can reset independently of PulseView. Link speed is nominal link capacity, not current throughput. Raw values are bytes/second; **Mbps = bytes/second × 8 / 1,000,000**. The UI does not put raw bytes/second underneath a Mbps label.

## Disk and volumes

PDH `PhysicalDisk` supplies read/write bytes/sec, idle-derived active percentage, transfer latency, current queue, reads/sec and writes/sec. `_Total` is the default; individual physical-disk instances have separate descriptors. Active time is `100 - idle`, bounded; total-disk behavior is the provider's aggregate and should not be interpreted as the maximum of all individual disks without additional logic.

Latency is seconds/transfer converted to milliseconds. Rates need two valid counter samples. Logical fixed-volume capacity/used/free/percent comes from `GetDiskFreeSpaceEx`, and is separate from physical-disk I/O. Drive-letter identity is not guaranteed stable after remounting or reassigning drives. The project does not claim SMART, disk temperature or privileged raw device access.

## Timing and support policy

Default sampling is one second; allowed setting range is 0.25–60 seconds. Some providers update more slowly than the requested interval. Rate counters require priming. Discovery periodically refreshes supported devices and can involve providers not presently shown. Unsupported API/counter values must remain `null`; diagnostics explain source availability.

Histories are timestamped, in-memory and bounded. Preset files save configuration, not recordings. Charts can redraw at a different cadence from data acquisition, but must not interpolate invented hardware samples into exports or status values. The app does not have a disk recording/export-of-measurements feature.

Definitions and source links: [SOURCES.md](SOURCES.md). Before release, complete the hardware checks in [WINDOWS_ACCEPTANCE.md](WINDOWS_ACCEPTANCE.md).
