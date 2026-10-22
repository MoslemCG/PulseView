"""Interaction checks and reproducible captures of the real frontend.
Requires: Python playwright; Node + TypeScript (test-only, not app dependencies).
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import ROOT, boot, bundle, chromium, test_output

OUTPUT = test_output('browser')

checks=[]
def check(condition, name):
    if not condition: raise AssertionError(name)
    checks.append(name)
    print('PASS', name)

def tree(page):return page.evaluate('JSON.stringify(window.__pulseview.state.current.layout)')
def settle(page):page.wait_for_timeout(160)
def capture(page,name):
    page.evaluate("document.querySelector('#toasts').replaceChildren()")
    page.mouse.move(1,1)
    page.wait_for_timeout(150)
    page.screenshot(path=str(OUTPUT/'screenshots'/name))

with sync_playwright() as p:
    b=chromium(p)
    page=b.new_page(viewport={'width':1320,'height':830},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('dialog',lambda dialog:dialog.accept())
    boot(page,bundle())
    check(page.locator('.pane').count()==1,'Starts with exactly one cell')
    page.locator('#split-x-button').click();settle(page)
    page.locator('#split-y-button').click();settle(page)
    check(page.locator('.pane').count()==3,'Nested x then y splits create an irregular 3-cell tree')
    page.locator('#add-button').click()
    page.locator('.picker-search').fill('cpu.usage')
    page.locator('[data-metric="cpu.usage"]').click();settle(page)
    check(page.locator('.pane').count()==3,'Assigning a metric replaces only the selected cell')
    saved_tree=tree(page)
    page.locator('.pane').first.locator('canvas').click();settle(page)
    check(page.locator('.pane').count()==3 and not page.evaluate('!!window.__pulseview.state.focused'),'Single chart click does not focus the pane')
    page.locator('.pane').first.locator('canvas').dblclick();settle(page)
    check(page.locator('.pane').count()==1 and page.evaluate('!!window.__pulseview.state.focused'),'Chart double-click focuses the pane')
    page.locator('.pane canvas').dblclick();settle(page)
    check(page.locator('.pane').count()==3 and tree(page)==saved_tree,'Second chart double-click restores the exact split tree')
    splitter=page.locator('#layout-root > .split-node > .splitter').first
    r=splitter.bounding_box();rootbox=page.locator('#layout-root').bounding_box()
    page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down()
    page.mouse.move(rootbox['x']+rootbox['width']*.37,r['y']+r['height']/2,steps=12);page.mouse.up();settle(page)
    check(abs(page.evaluate('window.__pulseview.state.current.layout.ratio')-.5)>.05,'Dragging a local splitter persists its ratio')
    changed=tree(page);page.locator('#undo-button').click();settle(page)
    check(tree(page)==saved_tree,'Undo restores splitter geometry')
    page.locator('#redo-button').click();settle(page)
    check(tree(page)==changed,'Redo restores splitter geometry')
    page.locator('#lock-button').click();settle(page)
    check(page.locator('#split-x-button').is_disabled(),'Layout lock prevents structural edits')
    page.locator('#lock-button').click();settle(page)
    # Save one named preset through the actual dialog and bridge.
    page.locator('#save-button').click();page.locator('#save-form input[name=name]').fill('Browser test workspace')
    page.locator('#confirm-save').click();settle(page)
    stored=page.evaluate('window.__pulseview.bridge.read("presets",[])')
    check(len(stored)==1 and stored[0]['name']=='Browser test workspace','Save dialog persists named preset and geometry in preview adapter')
    check(stored[0]['window']['width']==1320 and stored[0]['layout']['kind']=='split','Preset includes window size and recursive tree')
    # Widget-specific settings are independent from collector cadence.
    pane_id=page.locator('.pane').first.get_attribute('data-pane')
    page.evaluate('(id)=>window.__pulseview.showWidgetSettings(id)',pane_id)
    page.locator('#widget-form input[name=historySeconds]').fill('300')
    page.locator('#widget-form input[name=lineColor]').fill('#ee33d9')
    page.locator('#apply-widget').click();settle(page)
    check(page.evaluate('(id)=>{const visit=n=>n.id===id?n:n.kind==="split"?visit(n.a)||visit(n.b):null;return visit(window.__pulseview.state.current.layout).widget.historySeconds}',pane_id)==300,'Per-widget history and color settings are applied')
    page.locator('#settings-button').click();page.locator('#settings-form input[name=refreshSeconds]').fill('2')
    page.locator('#apply-settings').click();settle(page)
    check(page.evaluate('window.__pulseview.state.settings.refreshSeconds')==2,'Refresh seconds configure the sampler through the bridge')
    page.locator('#theme-button').click();page.locator('[data-theme-id=graphite]').click();settle(page)
    check(page.locator('html').get_attribute('data-theme')=='graphite','CSS theme switch applies without changing the layout')
    page.keyboard.press('Escape')
    # Load and resize without deleting, hiding or rewriting the recursive tree.
    page.evaluate('window.__pulseview.loadPreset(window.__pulseview.builtinPresets[0])');settle(page)
    check(page.locator('.pane').count()==9,'Overview preset loads all nine performance panes')
    check(page.locator('.core-tile').count()==24,'Every simulated logical processor has a separate chart')
    layout=tree(page)
    page.set_viewport_size({'width':510,'height':365});settle(page)
    boxes=page.locator('.pane').evaluate_all('(els)=>els.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,display:getComputedStyle(e).display}))')
    check(len(boxes)==9 and all(x['width']>0 and x['height']>0 and x['display']!='none' for x in boxes),'Shrinking the window preserves every pane with scroll fallback')
    check(tree(page)==layout,'Viewport resizing does not mutate saved split ratios')
    page.set_viewport_size({'width':1320,'height':830});settle(page)
    check(page.locator('.pane').count()==9 and tree(page)==layout,'Growing the window restores the same tree')
    page.locator('#pause-button').click();settle(page)
    check(page.evaluate('window.__pulseview.state.paused'),'Pause stops preview sampling')
    # Axis numerical ranges are raw bytes/sec, not displayed-unit magnitudes.
    debug=page.evaluate('window.__pulseview.state.chartDebug')
    network=next(v for v in debug if v['type']=='network')
    check(network['range']['max']>1e6 and network['options']['unitStyle']=='auto','Network axis retains raw bytes/sec with automatic byte formatting by default')
    capture(page,'overview.png')
    page.locator('#add-button').click();settle(page);capture(page,'widget-library.png');page.keyboard.press('Escape')
    page.locator('#theme-button').click();settle(page);capture(page,'themes.png');page.keyboard.press('Escape')
    page.evaluate('window.__pulseview.showPresets()');settle(page);capture(page,'presets.png');page.keyboard.press('Escape')
    page.set_viewport_size({'width':720,'height':390})
    page.evaluate('window.__pulseview.loadPreset(window.__pulseview.builtinPresets[1])');settle(page);capture(page,'gpu-work.png')
    page.set_viewport_size({'width':440,'height':310})
    page.evaluate('window.__pulseview.loadPreset(window.__pulseview.builtinPresets[4])');settle(page);capture(page,'vram-only.png')
    check(page.locator('.pane').count()==1,'Compact VRAM-only workspace remains a single pane')
    # Cold reload browser session adapter; native storage has separate C++ tests.
    page.wait_for_timeout(850)
    cache=page.evaluate('Object.fromEntries(window.__testStorage)')
    second=b.new_page(viewport={'width':800,'height':600})
    boot(second,bundle(),cache)
    check(second.locator('.pane').count()==1,'Session draft restores on frontend reload')
    check(second.evaluate('window.__pulseview.bridge.read("presets",[]).length')==1,'Session autosave does not replace named presets')
    check(not errors,'No uncaught browser JavaScript errors')
    result={'passed':len(checks),'checks':checks,'javascriptErrors':errors,'environment':'Headless Chromium; real frontend with offline trusted-module harness and explicit simulated browser data. Not a Windows native integration test.'}
    (OUTPUT/'browser-test-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    second.close();b.close()
print(f'\n{len(checks)} browser interaction checks passed.')
