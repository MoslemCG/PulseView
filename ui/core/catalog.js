import { DEFAULT_FILL_OPACITY } from './chart-model.js';
/** Canonical alias IDs. Native discovery adds per-device/per-engine/per-processor IDs. */
const definitions = [
    ['cpu.usage', 'CPU Total', 'CPU', '%', 100, 'cpu', 'Processor Time'],
    ['cpu.utility', 'CPU Utility', 'CPU', '%', 100, 'cpu', 'Processor Utility; frequency-aware, can exceed 100%'],
    ['cpu.frequency', 'CPU Frequency', 'CPU', 'MHz', null, 'cpu', 'Processor performance counter'],
    ['memory.used', 'RAM Used', 'Memory', 'bytes', null, 'ram', 'Physical total minus available'],
    ['memory.percent', 'RAM Utilization', 'Memory', '%', 100, 'ram', 'GlobalMemoryStatusEx'],
    ['memory.available', 'RAM Available', 'Memory', 'bytes', null, 'ram', 'Available physical memory'],
    ['memory.total', 'RAM Capacity', 'Memory', 'bytes', null, 'ram', 'OS-visible physical memory'],
    ['memory.commit', 'Committed Memory', 'Memory', 'bytes', null, 'ram', 'GetPerformanceInfo: CommitTotal'],
    ['memory.commitLimit', 'Commit Limit', 'Memory', 'bytes', null, 'ram', 'GetPerformanceInfo: CommitLimit'],
    ['memory.commitPercent', 'Commit Utilization', 'Memory', '%', 100, 'ram', 'CommitTotal / CommitLimit'],
    ['memory.cache', 'System Cache', 'Memory', 'bytes', null, 'ram', 'GetPerformanceInfo: SystemCache, not Task Manager Cached'],
    ['memory.paged', 'Paged Kernel Pool', 'Memory', 'bytes', null, 'ram', 'GetPerformanceInfo: KernelPaged'],
    ['memory.nonpaged', 'Nonpaged Kernel Pool', 'Memory', 'bytes', null, 'ram', 'GetPerformanceInfo: KernelNonpaged'],
    ['gpu.total', 'GPU Busiest Engine', 'GPU', '%', 100, 'gpu', 'WDDM: maximum aggregated physical-engine load'],
    ['gpu.3d', 'GPU 3D', 'GPU', '%', 100, 'gpu', 'WDDM 3D engines'],
    ['gpu.compute', 'GPU Compute', 'GPU', '%', 100, 'gpu', 'WDDM Compute engines; not CUDA-only utilization'],
    ['gpu.cuda', 'GPU CUDA Engine', 'GPU', '%', 100, 'gpu', 'Only available when the Windows driver exposes an engine named CUDA'],
    ['gpu.copy', 'GPU Copy', 'GPU', '%', 100, 'copy', 'WDDM Copy engines'],
    ['gpu.encode', 'Video Encode', 'GPU', '%', 100, 'net', 'WDDM VideoEncode engines'],
    ['gpu.decode', 'Video Decode', 'GPU', '%', 100, 'net', 'WDDM VideoDecode engines'],
    ['gpu.videoProcessing', 'Video Processing', 'GPU', '%', 100, 'net', 'WDDM VideoProcessing engines'],
    ['gpu.vram.used', 'VRAM', 'GPU', 'bytes', null, 'vram', 'Whole-adapter WDDM dedicated memory, not this process'],
    ['gpu.vram.percent', 'VRAM Utilization', 'GPU', '%', 100, 'vram', 'Dedicated usage / DXGI dedicated capacity'],
    ['gpu.vram.total', 'VRAM Capacity', 'GPU', 'bytes', null, 'vram', 'DXGI dedicated video memory capacity'],
    ['gpu.vram.free', 'VRAM Headroom', 'GPU', 'bytes', null, 'vram', 'Capacity minus dedicated usage; not an allocation guarantee'],
    ['gpu.shared.used', 'Shared GPU Memory', 'GPU', 'bytes', null, 'copy', 'Whole-adapter WDDM shared usage'],
    ['gpu.shared.total', 'Shared GPU Capacity', 'GPU', 'bytes', null, 'copy', 'DXGI shared system-memory limit'],
    ['nvidia.utilization', 'NVIDIA GPU Activity', 'NVIDIA', '%', 100, 'gpu', 'NVML general GPU busy, NOT isolated CUDA load'],
    ['nvidia.memoryUtilization', 'Memory Controller Busy', 'NVIDIA', '%', 100, 'vram', 'NVML memory activity, NOT VRAM allocation'],
    ['nvidia.temperature', 'GPU Temperature', 'NVIDIA', '°C', null, 'vram', 'NVML; support is driver/device dependent'],
    ['nvidia.power', 'GPU Power', 'NVIDIA', 'W', null, 'vram', 'NVML board power'],
    ['nvidia.fan', 'GPU Fan', 'NVIDIA', '%', 100, 'copy', 'NVML fan speed'],
    ['nvidia.clock', 'GPU Graphics Clock', 'NVIDIA', 'MHz', null, 'gpu', 'NVML graphics clock'],
    ['nvidia.memoryClock', 'GPU Memory Clock', 'NVIDIA', 'MHz', null, 'vram', 'NVML memory clock'],
    ['nvidia.encode', 'NVENC Activity', 'NVIDIA', '%', 100, 'net', 'NVML encoder utilization'],
    ['nvidia.decode', 'NVDEC Activity', 'NVIDIA', '%', 100, 'net', 'NVML decoder utilization'],
    ['net.download', 'Network Download', 'Network', 'B/s', null, 'net', 'Default-route interface receive rate; not necessarily Internet-only'],
    ['net.upload', 'Network Upload', 'Network', 'B/s', null, 'upload', 'Default-route interface transmit rate'],
    ['net.received', 'Bytes Received', 'Network', 'bytes', null, 'net', 'Interface lifetime octet count'],
    ['net.sent', 'Bytes Sent', 'Network', 'bytes', null, 'upload', 'Interface lifetime octet count'],
    ['net.linkReceive', 'Receive Link Speed', 'Network', 'B/s', null, 'net', 'Interface receive link speed, not traffic'],
    ['net.linkTransmit', 'Transmit Link Speed', 'Network', 'B/s', null, 'upload', 'Interface transmit link speed, not traffic'],
    ['disk.read', 'Disk Read', 'Disk', 'B/s', null, 'net', 'PhysicalDisk _Total read bytes/sec'],
    ['disk.write', 'Disk Write', 'Disk', 'B/s', null, 'upload', 'PhysicalDisk _Total write bytes/sec'],
    ['disk.active', 'Disk Active Time', 'Disk', '%', 100, 'copy', '100 minus PhysicalDisk _Total idle time'],
    ['disk.latency', 'Disk Transfer Latency', 'Disk', 'ms', null, 'vram', 'Average transfer seconds converted to milliseconds'],
    ['disk.queue', 'Disk Queue Length', 'Disk', 'count', null, 'vram', 'Current physical disk queue length'],
    ['disk.readIops', 'Disk Read IOPS', 'Disk', 'IOPS', null, 'net', 'PhysicalDisk reads/sec'],
    ['disk.writeIops', 'Disk Write IOPS', 'Disk', 'IOPS', null, 'upload', 'PhysicalDisk writes/sec'],
];
export const BASE_METRICS = definitions.map(([id, label, category, unit, max, color, source]) => ({ id, label, category, unit, max, color, source, available: false, reason: 'Waiting for native discovery', device: '' }));
export const metricMap = () => new Map(BASE_METRICS.map(x => [x.id, { ...x }]));
export const WIDGET_TYPES = [
    { type: 'metric', name: 'Area / Line Chart', icon: 'chart', description: 'Any metric. Gradient area, line, bars, meter or number.' },
    { type: 'comparison', name: 'Multi-series Chart', icon: 'pulse', description: 'Several metrics together. Explicit normalization for different units.' },
    { type: 'cores', name: 'Logical CPU Processors', icon: 'grid', description: 'A micro-chart for every logical processor; no automatic hiding.' },
    { type: 'network', name: 'Network Traffic', icon: 'network', description: 'Download and upload with independent colors and shared time axis.' },
    { type: 'disk', name: 'Disk I/O', icon: 'disk', description: 'Read/write rates, with active-time and latency details.' },
];
export function makeWidget(metric = 'cpu.usage', type = 'metric') {
    return { type, metric, title: '', chart: 'area', historySeconds: 0, grid: true, axes: true, legend: true, stats: true,
        color: 'auto', lineColor: '', gradientColor: '', lineWidth: 1.5, fillOpacity: DEFAULT_FILL_OPACITY, unit: 'auto', scale: 'auto',
        fixedMin: 0, fixedMax: 100, displaySeconds: 0,
        metrics: type === 'comparison' ? ['gpu.total', 'gpu.vram.percent', 'cpu.usage', 'memory.percent'] : [],
        normalized: type === 'comparison', coreColumns: 0 };
}
export function safeWidget(w) {
    const result = { ...makeWidget(), ...w };
    const types = WIDGET_TYPES.map(t => t.type);
    if (!types.includes(result.type))
        result.type = 'metric';
    for (const k of ['metric', 'title', 'color', 'unit', 'scale'])
        result[k] = String(result[k] ?? '').slice(0, 200);
    result.metrics = Array.isArray(result.metrics) ? result.metrics.filter(x => typeof x === 'string').slice(0, 12) : [];
    const num = (key, a, b, fallback) => { result[key] = Number.isFinite(Number(result[key])) ? Math.max(a, Math.min(b, Number(result[key]))) : fallback; };
    // 0 = follow the app's normal/compressed history. 120 was the old untouched default, so it follows too.
    num('historySeconds', 0, 3600, 0);
    result.historySeconds = result.historySeconds === 120 ? 0 : result.historySeconds && Math.max(15, result.historySeconds);
    num('lineWidth', .5, 4, 1.5);
    num('fillOpacity', 0, .8, DEFAULT_FILL_OPACITY);
    num('displaySeconds', 0, 60, 0);
    num('coreColumns', 0, 32, 0);
    result.coreColumns = Math.floor(result.coreColumns);
    for (const key of ['grid', 'axes', 'legend', 'stats', 'normalized'])
        result[key] = result[key] === true;
    num('fixedMin', -1e15, 1e15, 0);
    num('fixedMax', -1e15, 1e15, 100);
    if (result.fixedMax <= result.fixedMin)
        result.fixedMax = result.fixedMin + 1;
    for (const key of ['lineColor', 'gradientColor'])
        if (!/^#[0-9a-fA-F]{6}$/.test(result[key]))
            result[key] = '';
    if (!['area', 'line', 'bars', 'number', 'meter'].includes(result.chart))
        result.chart = 'area';
    if (result.type === 'comparison' && !result.metrics.length)
        result.metrics = ['cpu.usage'];
    return result;
}
