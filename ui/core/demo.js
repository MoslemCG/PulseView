import { BASE_METRICS } from './catalog.js';
const GiB = 2 ** 30;
let seed = 8128;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }
const wave = (t, a, b, c) => a + Math.sin(t * b) * c;
export function demoCatalog() {
    const metrics = BASE_METRICS.map(x => ({ ...x, available: x.id !== 'gpu.cuda', reason: x.id === 'gpu.cuda' ? 'Demo driver exposes Compute, not a separately identifiable CUDA engine' : '', device: x.category === 'CPU' ? 'AMD Ryzen 9 5900X' : x.category === 'GPU' || x.category === 'NVIDIA' ? 'NVIDIA GeForce RTX 4090' : x.category === 'Memory' ? '64 GiB DDR4' : x.category === 'Network' ? 'Ethernet · 2.5 Gbps' : 'NVMe SSD' }));
    metrics.find(x => x.id === 'gpu.vram.used').max = 24 * GiB;
    metrics.find(x => x.id === 'memory.used').max = 64 * GiB;
    for (let i = 0; i < 24; i++)
        metrics.push({ id: `cpu.logical.0.${i}`, label: `Logical processor ${i}`, category: 'CPU', unit: '%', max: 100, color: 'cpu', source: 'Simulated processor-time counter', available: true, device: 'AMD Ryzen 9 5900X', group: 'logical' });
    for (const [name, type] of [['3D', '3d'], ['Compute_0', 'compute'], ['Copy', 'copy'], ['VideoDecode', 'decode']])
        metrics.push({ id: `gpu.demo.engine.${type}`, label: `Engine ${name}`, category: 'GPU', unit: '%', max: 100, color: type === 'copy' ? 'copy' : 'gpu', source: 'Simulated WDDM engine', available: true, device: 'NVIDIA GeForce RTX 4090' });
    return { metrics, system: { cpu: 'AMD Ryzen 9 5900X', logicalProcessors: 24, physicalCores: 12, gpu: 'NVIDIA GeForce RTX 4090', memory: 64 * GiB, network: 'Ethernet · 2.5 Gbps' }, diagnostics: ['Browser preview: all readings are deterministic simulated data. Native desktop mode never falls back to simulation.'] };
}
export function demoSample(timestamp) {
    const t = timestamp / 1000, noise = (amp) => (random() - .5) * amp;
    const cpu = Math.max(2, Math.min(96, wave(t, 24, .17, 9) + noise(18) + Math.max(0, Math.sin(t * .041)) * 18));
    const gpu = Math.max(0, Math.min(100, wave(t, 70, .083, 9) + noise(12)));
    const vr = wave(t, 14.8, .037, .7) + noise(.13), ram = wave(t, 22.6, .025, 1.1) + noise(.12);
    const vals = {
        'cpu.usage': cpu, 'cpu.utility': cpu * 1.17, 'cpu.frequency': 4200 + noise(230),
        'memory.used': ram * GiB, 'memory.percent': ram / 64 * 100, 'memory.available': (64 - ram) * GiB, 'memory.total': 64 * GiB,
        'memory.commit': (ram + 7) * GiB, 'memory.commitLimit': 88 * GiB, 'memory.commitPercent': (ram + 7) / 88 * 100, 'memory.cache': 8.7 * GiB, 'memory.paged': .46 * GiB, 'memory.nonpaged': .39 * GiB,
        'gpu.total': gpu, 'gpu.compute': gpu, 'gpu.cuda': null, 'gpu.3d': Math.max(0, 34 + Math.sin(t * .34) * 16 + noise(17)), 'gpu.copy': Math.max(0, 12 + noise(15)),
        'gpu.encode': 2, 'gpu.decode': 6, 'gpu.videoProcessing': 0, 'gpu.vram.used': vr * GiB, 'gpu.vram.total': 24 * GiB, 'gpu.vram.free': (24 - vr) * GiB, 'gpu.vram.percent': vr / 24 * 100, 'gpu.shared.used': .35 * GiB, 'gpu.shared.total': 32 * GiB,
        'nvidia.utilization': gpu, 'nvidia.memoryUtilization': 47 + noise(8), 'nvidia.temperature': 62 + noise(2), 'nvidia.power': 267 + noise(18), 'nvidia.fan': 42, 'nvidia.clock': 2520, 'nvidia.memoryClock': 10501, 'nvidia.encode': 2, 'nvidia.decode': 6,
        'net.download': Math.max(0, wave(t, 54e6, .063, 19e6) + noise(23e6)), 'net.upload': Math.max(0, wave(t, 4.2e6, .15, 2e6) + noise(2e6)),
        'net.received': 12.6 * GiB, 'net.sent': 1.2 * GiB, 'net.linkReceive': 2.5e9 / 8, 'net.linkTransmit': 2.5e9 / 8,
        'disk.read': Math.max(0, wave(t, 170e6, .13, 100e6) + noise(40e6)), 'disk.write': Math.max(0, wave(t, 54e6, .17, 30e6) + noise(20e6)),
        'disk.active': 18 + noise(12), 'disk.latency': .23 + random() * .2, 'disk.queue': 1, 'disk.readIops': 1240 + noise(400), 'disk.writeIops': 380 + noise(100),
    };
    for (let i = 0; i < 24; i++)
        vals[`cpu.logical.0.${i}`] = Math.max(0, Math.min(100, cpu + (Math.sin(t * .13 + i * 2) + Math.sin(t * .39 + i)) * 12 + noise(18)));
    for (const type of ['3d', 'compute', 'copy', 'decode'])
        vals[`gpu.demo.engine.${type}`] = vals[`gpu.${type}`];
    return { timestamp, values: vals, elapsedSeconds: 1 };
}
