#!/usr/bin/env python3
"""Capture the real browser-preview UI with explicit synthetic showcase samples.

Developer-only: Python + Playwright + Pillow, existing Chromium or Playwright's
browser. Outputs go to ignored out/readme-media; review before promoting to docs.
Native collection and production assets are never modified.
"""
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'out' / 'readme-media'

# A complete chronological ten-minute workload, not sparse test fixtures.
# GPU/CPU bursts have different phases; allocations rise/fall with workload stages.
SEED = r'''({offset = 0} = {}) => {
  const p = window.__pulseview;
  if (!p || p.bridge.native) throw Error('Showcase samples are preview-only');
  clearInterval(p.bridge.timer); p.bridge.paused = true; p.store.clear();
  const end = Date.now(), GiB = 2 ** 30;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const pulse = (x,c,w,h) => h*Math.exp(-(((x-c)/w)**2));
  const noise = (x,k) => Math.sin(x*2.37+k)*Math.cos(x*.713+k*3);
  let last;
  for(let i=0;i<=600;i++) {
    const x=i+offset, q=x%140;
    const gpu=clamp(36+16*Math.sin(x*.072)+7*Math.sin(x*.29)+4*noise(x,2)
      +pulse(q,45,13,36)+pulse(q,103,8,26),7,97);
    const cpu=clamp(25+10*Math.sin(x*.14)+7*Math.sin(x*.51)+6*noise(x,5)
      +pulse(q,70,10,32)+pulse(q,120,5,22),4,92);
    const vram=clamp(11.5+3.6*Math.sin(x*.039)+1.4*Math.sin(x*.105)
      +pulse(q,94,18,3.3)+.22*noise(x,4),5.8,21.8);
    const ram=clamp(24+4.5*Math.sin(x*.033)+2.1*Math.sin(x*.12)
      +pulse(q,50,20,6)+.3*noise(x,7),15,44);
    const download=clamp(28+16*Math.sin(x*.10)+8*Math.sin(x*.39)
      +pulse(q,45,12,47)+pulse(q,115,7,32)+4*noise(x,8),2,115)*1e6;
    const upload=clamp(8+5*Math.sin(x*.17)+pulse(q,83,14,20)+2*noise(x,9),.5,42)*1e6;
    const v={
      'cpu.usage':cpu,'cpu.utility':Math.min(100,cpu*1.09),'cpu.frequency':4300+180*Math.sin(x*.11),
      'gpu.total':gpu,'gpu.compute':gpu,'gpu.cuda':null,
      'gpu.3d':clamp(30+16*Math.sin(x*.13)+9*noise(x,3)+pulse(q,65,10,38),3,94),
      'gpu.copy':clamp(12+9*Math.sin(x*.22)+pulse(q,26,9,36),1,71),
      'gpu.vram.used':vram*GiB,'gpu.vram.total':24*GiB,'gpu.vram.free':(24-vram)*GiB,'gpu.vram.percent':vram/24*100,
      'memory.used':ram*GiB,'memory.total':64*GiB,'memory.available':(64-ram)*GiB,'memory.percent':ram/64*100,
      'nvidia.utilization':gpu,'nvidia.temperature':56+gpu*.19,'nvidia.power':95+gpu*2.7,
      'net.download':download,'net.upload':upload,'net.received':12.6*GiB,'net.sent':1.2*GiB,
      'net.linkReceive':2.5e9/8,'net.linkTransmit':2.5e9/8,
      'disk.read':Math.max(4,100+65*Math.sin(x*.11)+pulse(q,35,7,220)+20*noise(x,11))*1e6,
      'disk.write':Math.max(2,38+27*Math.sin(x*.16)+pulse(q,95,11,120)+9*noise(x,12))*1e6,
      'disk.active':clamp(24+cpu*.4+10*Math.sin(x*.12),1,99),'disk.latency':.35+.12*Math.sin(x*.1)
    };
    for(let core=0;core<24;core++) {
      v[`cpu.logical.0.${core}`]=clamp(cpu*(.5+(core%7)*.16)+17*Math.sin(x*.18+core*1.7)
        +10*noise(x+core,core)+pulse(q,(core*9)%135,8,34),2,98);
    }
    last={timestamp:end-(600-i)*1000,values:v}; p.store.add(last);
  }
  p.bridge.emit('metrics',last);
  const s=document.querySelector('#connection-status');
  if(s) s.textContent='DEMO · synthetic showcase data';
  let badge=document.querySelector('#readme-demo-badge');
  if(!badge){badge=document.createElement('div');badge.id='readme-demo-badge';
    badge.textContent='DEMO · SYNTHETIC DATA';
    badge.style.cssText='position:fixed;bottom:5px;right:12px;z-index:999999;padding:3px 7px;border:1px solid #37516b;border-radius:3px;background:#071321ed;color:#9fb6cd;font:10px Segoe UI,Arial;pointer-events:none';
    document.body.append(badge);}
  return ['gpu.compute','gpu.vram.used','cpu.usage','net.download'].map(id=>{
    const a=p.store.get(id,120).map(x=>x.v);return {id,min:Math.min(...a),max:Math.max(...a)};
  });
}'''


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'ui')))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            options = {'headless': True}
            if os.getenv('PULSEVIEW_CHROMIUM'):
                options['executable_path'] = os.environ['PULSEVIEW_CHROMIUM']
            browser = pw.chromium.launch(**options)
            context = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
            page = context.new_page()
            page.on('dialog', lambda dialog: dialog.accept())
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            url = f'http://127.0.0.1:{server.server_port}/'

            def fresh(preset, width=1100, height=660, theme='midnight'):
                page.goto(url)
                page.evaluate('localStorage.clear()')
                page.set_viewport_size({'width': width, 'height': height})
                page.goto(url + '?preset=' + preset)
                page.wait_for_function('() => window.__pulseview?.state.catalog.some(m=>m.group==="logical")')
                page.wait_for_timeout(180)
                if theme != 'midnight':
                    page.evaluate('''async theme=>{const p=window.__pulseview;const q=structuredClone(p.state.current);q.settings.theme=theme;await p.loadPreset(q);}''', theme)
                signal = page.evaluate(SEED, {})
                page.wait_for_timeout(120)
                return signal

            def shot(name):
                page.evaluate("document.querySelector('#toasts').replaceChildren()")
                page.wait_for_timeout(100)
                page.screenshot(path=str(OUTPUT / name))
                print('Captured', name, flush=True)

            def gif(name, frames, duration=1100):
                images = [Image.open(OUTPUT / frame).convert('RGB') for frame in frames]
                images[0].save(OUTPUT / name, save_all=True, append_images=images[1:],
                               duration=duration, loop=0, optimize=True)
                print('Encoded', name, flush=True)

            signal = fresh('builtin-overview', 1440, 900)
            shot('overview.png')
            page.locator('#add-button').click(); shot('widget-library.png'); page.keyboard.press('Escape')
            page.evaluate('window.__pulseview.showPresets()'); shot('presets.png'); page.keyboard.press('Escape')
            page.locator('#settings-button').click(); shot('settings.png'); page.keyboard.press('Escape')
            page.locator('#help-button').click(); shot('about.png'); page.keyboard.press('Escape')

            fresh('builtin-gpu', 1100, 650)
            shot('gpu-work.png')
            canvas = page.locator('.pane canvas').first
            box = canvas.bounding_box()
            page.mouse.move(box['x']+box['width']*.61, box['y']+box['height']*.47)
            page.wait_for_timeout(180); shot('sample-hover.png')
            page.mouse.move(0, 0)
            page.locator('#compress-button').click(); shot('time-compression.png')
            page.locator('#compress-button').click()
            frames = []
            for i in range(3):
                page.evaluate(SEED, {'offset': i*4}); shot(f'live-{i}.png'); frames.append(f'live-{i}.png')
            gif('live-workload.gif', frames, 650)
            shot('chrome-visible.png')
            page.locator('.pane canvas').first.click(button='middle'); shot('charts-only.png')
            page.locator('.pane canvas').first.click(button='middle'); shot('chrome-restored.png')
            gif('charts-only.gif', ['chrome-visible.png', 'charts-only.png', 'chrome-restored.png'], 1300)

            fresh('builtin-gpu', 1100, 650)
            shot('split-1.png')
            page.locator('.pane-header').first.click()
            page.locator('#split-y-button').click(); shot('split-2.png')
            page.locator('#split-x-button').click(); shot('split-3.png')
            page.locator('#undo-button').click(); page.locator('#undo-button').click(); shot('split-4.png')
            gif('recursive-splits.gif', [f'split-{i}.png' for i in range(1,5)], 1200)

            fresh('builtin-cpu', 1100, 700); shot('cpu-cores.png')
            fresh('builtin-network', 1000, 700); shot('network.png')
            fresh('builtin-vram', 520, 360); shot('vram-only.png')
            theme_frames=[]
            for theme in ['midnight','graphite','onyx','aurora','amethyst','cobalt','ember','ivory']:
                fresh('builtin-gpu', 1100, 650, theme)
                name=f'theme-{theme}.png';shot(name);theme_frames.append(name)
            gif('skins.gif', theme_frames, 1300)
            fresh('builtin-gpu', 1100, 700)
            page.locator('#theme-button').click();shot('themes.png')
            assert not errors, errors
            (OUTPUT / 'capture-results.json').write_text(json.dumps({
                'mode':'Real frontend / browser preview / synthetic showcase data',
                'signals':signal,'javascriptErrors':errors,
                'productionAssetsChanged':False,
            },indent=2),encoding='utf-8')
            browser.close()
    finally:
        server.shutdown(); server.server_close()


if __name__ == '__main__':
    main()
