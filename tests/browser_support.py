"""Run the actual ES-module UI offline when navigation is unavailable.
The Windows app does not use this harness, a test bundle or memory storage.
"""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

def test_output(suite):
    path = ROOT / 'out' / 'test-results' / suite
    (path / 'screenshots').mkdir(parents=True, exist_ok=True)
    return path

def bundle():
    output = Path(tempfile.gettempdir()) / 'pulseview-browser-tests.bundle.js'
    subprocess.run(['node', str(ROOT / 'scripts/bundle-test.cjs'), str(output)], check=True)
    return output.read_text(encoding='utf-8')

def html():
    ui = ROOT / 'ui'
    text = (ui / 'index.html').read_text(encoding='utf-8')
    # set_content has no local-origin module loader. Inline trusted project files,
    # never external scripts, and test the production CSP separately on Windows.
    text = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', text)
    text = re.sub(r'<script[^>]+src="app.js"[^>]*></script>', '', text)
    text = re.sub(r'<link[^>]+href="([^"]+\.css)"[^>]*>',
                  lambda m: '<style>' + (ui / m[1]).read_text(encoding='utf-8') + '</style>', text)
    text = re.sub(r'<link rel="icon"[^>]*>', '', text)
    logo = base64.b64encode((ui / 'assets/logo.svg').read_bytes()).decode()
    return text.replace('src="assets/logo.svg"', 'src="data:image/svg+xml;base64,' + logo + '"')

def boot(page, code, storage=None):
    page.set_content(html())
    page.evaluate('''initial => {
      const map = new Map(Object.entries(initial));
      Object.defineProperty(window, 'localStorage', {value: {
        getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,String(v)),
        removeItem: k => map.delete(k), clear: () => map.clear()
      }});
      window.__testStorage = map;
    }''', storage or {})
    page.add_script_tag(content=code)
    page.wait_for_function('window.__pulseview && window.__pulseview.state.catalog.some(m => m.group === "logical")')
    page.wait_for_timeout(250)

def chromium(playwright):
    exe = os.getenv('PULSEVIEW_CHROMIUM')
    if not exe and Path('/usr/bin/chromium').exists(): exe = '/usr/bin/chromium'
    kwargs = {'headless': True}
    if exe: kwargs['executable_path'] = exe
    if os.name != 'nt': kwargs['args'] = ['--no-sandbox']
    return playwright.chromium.launch(**kwargs)
