"""1.1 regression: actual handlers/canvas output; not a Windows native test."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_support import ROOT, boot, bundle, chromium, test_output

OUTPUT = test_output('revision-browser')

checks=[]
def check(ok, label):
    if not ok: raise AssertionError(label)
    checks.append(label);print('PASS',label,flush=True)
def settle(page,ms=180):page.wait_for_timeout(ms)
def state(page,field):return page.evaluate('window.__pulseview.state.'+field)
def tree(page):return page.evaluate('JSON.stringify(window.__pulseview.state.current.layout)')
def load(page,index):page.evaluate('(i)=>window.__pulseview.loadPreset(window.__pulseview.builtinPresets[i])',index);settle(page)
def shot(page,name):
    page.evaluate("document.querySelector('#toasts').replaceChildren()")
    page.screenshot(path=str(OUTPUT/'screenshots'/name))
def middle(page,index=0):
    c=page.locator('.pane canvas').nth(index);b=c.bounding_box()
    page.mouse.click(b['x']+b['width']*.55,b['y']+b['height']*.55,button='middle');settle(page)
def hover(page,index=0,frac=.55):
    page.locator('.pane').nth(index).locator('canvas').first.scroll_into_view_if_needed();settle(page,60)
    debug=page.evaluate('window.__pulseview.state.chartDebug')[index]['plot']
    b=page.locator('.pane').nth(index).locator('canvas').first.bounding_box()
    page.mouse.move(b['x']+debug['x']+debug['width']*frac,b['y']+debug['y']+debug['height']*.35);settle(page)
def allbars(page):return page.locator('#app > .titlebar,#app > .workspace-toolbar,#app > .statusbar').evaluate_all('(a)=>a.map(e=>getComputedStyle(e).display)')
def single(page,widget):
    page.evaluate('''w=>window.__pulseview.loadPreset({schemaVersion:1,id:'test-single',name:'Chart test',builtin:true,layout:{kind:'leaf',id:'test-leaf',widget:w},settings:{theme:'midnight',refreshSeconds:1},window:{width:720,height:390}})''',widget);settle(page)

with sync_playwright() as pw:
    browser=chromium(pw); page=browser.new_page(viewport={'width':720,'height':390},device_scale_factor=1);page.set_default_timeout(5000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    boot(page,bundle());load(page,1)
    page.locator('#pause-button').click();settle(page)
    initial=tree(page)
    page.evaluate("window.__savedCanvases=[...document.querySelectorAll('.pane canvas')]")
    h0=page.locator('#workspace').bounding_box()['height']
    page.evaluate("window.__middlePrevented=[];document.querySelector('#workspace').addEventListener('mousedown',e=>{if(e.button===1)window.__middlePrevented.push(e.defaultPrevented)})")
    page.evaluate("(()=>{const b=window.__pulseview.bridge,call=b.call.bind(b);window.__chromeCalls=[];b.call=(m,p)=>{if(m==='window.chrome')window.__chromeCalls.push(p);return call(m,p)}})()")
    r0=page.locator('#layout-root').bounding_box()
    middle(page)
    check(state(page,'settings.chromeHidden'),'Middle click enters charts-only mode')
    r1=page.locator('#layout-root').bounding_box();adj=page.evaluate('window.__chromeCalls.at(-1).adjust')
    check(all(abs(adj[k]-v)<.51 for k,v in {'x':r0['x']-r1['x'],'y':r0['y']-r1['y'],'width':r0['width']-r1['width'],'height':r0['height']-r1['height']}.items()) and adj['height']<-75,'Native frame is asked to shrink by exactly the removed bars, keeping chart size and position')
    check(all(v=='none' for v in allbars(page)),'Titlebar, toolbar and footer are all removed from layout')
    check(page.locator('#focus-bar').is_hidden(),'Focus strip is also hidden in charts-only mode')
    check(page.locator('#workspace').bounding_box()['height']>h0+75,'Browser preview (no native frame resize) still lets the layout use freed space')
    check(page.locator('.pane').count()==3 and tree(page)==initial,'Charts-only mode keeps all panes and exact split ratios')
    check(page.evaluate("window.__savedCanvases.every((e,i)=>e===document.querySelectorAll('.pane canvas')[i])"),'Toggle retains the same live chart canvases (no rebuild or reset)')
    check(page.evaluate('window.__middlePrevented.every(Boolean)'),'Middle-button DOWN prevents browser autoscroll')
    shot(page,'gpu-work-compact.png')
    middle(page)
    check(not state(page,'settings.chromeHidden') and all(v!='none' for v in allbars(page)),'Second middle click restores every application bar')
    check(page.locator('#workspace').bounding_box()['height']==h0 and tree(page)==initial,'Restore returns the original workspace size and hierarchy')
    page.locator('.pane canvas').first.click(button='right');settle(page)
    check(not state(page,'settings.chromeHidden'),'Right click still opens the pane menu, not compact mode')
    page.keyboard.press('Escape')
    page.locator('.pane canvas').first.dblclick();settle(page)
    check(page.locator('.pane').count()==1 and bool(state(page,'focused')),'Primary double-click retains independent pane focus')
    middle(page);check(state(page,'settings.chromeHidden') and bool(state(page,'focused')),'Middle click also works while a pane is focused')
    page.keyboard.press('Escape');settle(page)
    check(not state(page,'settings.chromeHidden') and bool(state(page,'focused')),'Escape restores bars first without silently changing focused pane')
    page.keyboard.press('Escape');settle(page)
    check(page.locator('.pane').count()==3 and tree(page)==initial,'Next Escape restores the complete focused layout')
    page.keyboard.press('Control+Shift+C');settle(page)
    check(state(page,'settings.chromeHidden'),'Keyboard fallback Ctrl+Shift+C toggles charts-only mode')
    for _ in range(3):middle(page)
    check(not state(page,'settings.chromeHidden'),'Repeated middle clicks toggle once each, with no double event')
    page.mouse.wheel(0,20);settle(page)
    check(not state(page,'settings.chromeHidden'),'Mouse wheel rotation does not toggle presentation')
    # Save and restore the actual UI preference, not an unrelated density setting.
    middle(page);page.keyboard.press('Control+s');settle(page)
    page.locator('#save-form input[name=name]').fill('Compact GPU Test');page.locator('#confirm-save').click();settle(page,850)
    saved=page.evaluate('window.__pulseview.bridge.read("presets",[])')
    check(len(saved)==1 and saved[0]['settings']['chromeHidden'],'Saved preset stores charts-only mode as well as layout')
    check(saved[0]['window']['width']==720 and saved[0]['window']['height']==390,'Toggle does not change the saved outer window size')
    check(not any(k in saved[0]['window'] for k in ('x','y','monitor')),'Saved preset stores window size only, not position')
    cache=page.evaluate('Object.fromEntries(window.__testStorage)')
    reload=browser.new_page(viewport={'width':720,'height':390});boot(reload,bundle(),cache)
    check(state(reload,'settings.chromeHidden') and all(v=='none' for v in allbars(reload)),'Cold session restore remembers compact presentation')
    reload.keyboard.press('Escape');settle(reload);check(not state(reload,'settings.chromeHidden'),'Restored compact session remains recoverable with Escape');reload.close()
    page.keyboard.press('Escape');settle(page)
    # Actual hover at a coordinate in the visible plot: an on-canvas value label, no popup.
    hover(page,0,.62)
    check(page.locator('.chart-tooltip').count()==0,'Hover never opens a DOM popup')
    hs=state(page,'chartDebug')[0]['hover']
    check(hs is not None and hs['value'] is not None and 'GiB' in hs['text'],'Hover labels the nearest real sample with memory units')
    plot=state(page,'chartDebug')[0]['plot'];lb=hs['label']
    check(not hs['below'] and lb['y']+lb['height']<=hs['y'] and lb['x']>=plot['x']-1 and lb['x']+lb['width']<=plot['x']+plot['width']+1,'Value sits just above the targeted point, inside the plot')
    locked=(hs['id'],hs['time'])
    page.evaluate('''()=>{const p=window.__pulseview;p.bridge.emit('metrics',{timestamp:(p.store.lastTime||Date.now())+1000,values:{'gpu.vram.used':5*2**30}})}''');settle(page)
    hs2=state(page,'chartDebug')[0]['hover']
    check(hs2 is not None and (hs2['id'],hs2['time'])==locked,'A still pointer keeps the same selected sample while new data scrolls in')
    shot(page,'gpu-hover.png')
    page.mouse.move(1,1);settle(page);check(state(page,'chartDebug')[0]['hover'] is None,'Leaving plot clears the value label')
    hover(page,1,.45);check('%' in (state(page,'chartDebug')[1]['hover'] or {}).get('text',''),'GPU percentage hover works on a short chart')
    page.mouse.move(1,1);settle(page)
    styles=state(page,'chartDebug')
    check(styles[0]['style'][0]['color']=='#ffad0a' and styles[1]['style'][0]['color']=='#f52cdd','Default line hues match the reference amber and magenta palette')
    check(styles[0]['style'][0]['top']=='#ff9a1a' and styles[0]['style'][0]['mid']=='#9a4a0c','VRAM underfill is a same-hue orange ramp, not a flat amber fill')
    check(styles[0]['style'][0]['extent']['top']>styles[0]['plot']['y']+5,'Fill begins at the real curve crest rather than the chart ceiling')
    # Real pixels from a deterministic measurement fixture validate non-flat ramps.
    single(page,{'metric':'gpu.vram.used','historySeconds':60,'grid':False,'axes':False,'stats':False,'fillOpacity':.44})
    page.evaluate('''()=>{const p=window.__pulseview,s=p.store,t=Date.now();s.clear();for(let i=0;i<=60;i++)s.add({timestamp:t-60000+i*1000,values:{'gpu.vram.used':14*2**30,'gpu.vram.total':24*2**30}});p.bridge.emit('metrics',{timestamp:t,values:{'gpu.vram.used':14*2**30}})}''');settle(page)
    pixels=page.evaluate('''()=>{const c=document.querySelector('.pane canvas'),d=window.__pulseview.state.chartDebug[0],e=d.style[0].extent,x=Math.floor(c.width*.43),ctx=c.getContext('2d');return [.06,.5,.94].map(f=>[...ctx.getImageData(x,Math.floor(e.top+(e.bottom-e.top)*f),1,1).data])}''')
    check(all(px[0]>px[2] for px in pixels),'Canvas underfill keeps the line hue from crest to baseline')
    check(pixels[0][3]>pixels[1][3]>pixels[2][3],'Canvas underfill alpha genuinely fades toward the baseline')
    # Mixed-unit comparison: visible normalized coordinate AND original unit.
    single(page,{'type':'comparison','metrics':['cpu.usage','gpu.vram.used','net.download'],'normalized':True,'historySeconds':60})
    page.evaluate('''()=>{const p=window.__pulseview,t=Date.now();p.store.clear();for(let i=0;i<=60;i++)p.store.add({timestamp:t-60000+i*1000,values:{'cpu.usage':25+i/3,'gpu.vram.used':10*2**30,'net.download':30e6}});p.bridge.emit('metrics',{timestamp:t,values:{'cpu.usage':45,'gpu.vram.used':10*2**30,'net.download':30e6}})}''');settle(page)
    hover(page,0,.5);text=state(page,'chartDebug')[0]['hover']['text']
    check(' · ' in text and text.endswith('%'),'Normalized comparisons show the original unit alongside the displayed percent')
    shot(page,'comparison-hover.png');page.mouse.move(1,1)
    # Explicit gaps must remain unavailable at hover time.
    single(page,{'metric':'cpu.usage','historySeconds':60})
    page.evaluate('''()=>{const p=window.__pulseview,t=Date.now();p.store.clear();p.store.add({timestamp:t-60000,values:{'cpu.usage':10}});p.store.add({timestamp:t-30000,values:{'cpu.usage':null}});p.bridge.emit('metrics',{timestamp:t,values:{'cpu.usage':90}})}''');settle(page)
    hover(page,0,.5)
    check(state(page,'chartDebug')[0]['hover'] is None,'Hover over an explicit gap never fabricates a zero or interpolated value')
    hover(page,0,.3)
    check(state(page,'chartDebug')[0]['hover'] is None,'Sparse samples are not stretched across missing seconds')
    # Drawing joins across missed samples: no empty column in the line or fill.
    single(page,{'metric':'cpu.usage','historySeconds':60,'grid':False,'axes':False,'stats':False})
    page.evaluate('''()=>{const p=window.__pulseview,t=Date.now();p.store.clear();for(let i=0;i<=60;i++)p.store.add({timestamp:t-60000+i*1000,values:{'cpu.usage':i>=28&&i<=32?null:50}});p.bridge.emit('metrics',{timestamp:t,values:{'cpu.usage':50}})}''');settle(page)
    alphas=page.evaluate('''()=>{const c=document.querySelector('.pane canvas'),d=window.__pulseview.state.chartDebug[0].plot,ctx=c.getContext('2d'),r=c.width/c.getBoundingClientRect().width,x=Math.round((d.x+d.width*30/60)*r),y0=Math.round((d.y+d.height*.5)*r),y1=Math.round((d.y+d.height*.9)*r);return [ctx.getImageData(x,y0,1,1).data[3],ctx.getImageData(x,y1,1,1).data[3]]}''')
    check(all(a>0 for a in alphas),'A run of missed samples is bridged: line and fill stay continuous')
    hover(page,0,.5);check(state(page,'chartDebug')[0]['hover'] is None,'The bridge is drawing only; hover over it still reports no sample')
    page.mouse.move(1,1)
    # Refill fixture for further UI checks.
    page.evaluate("window.__pulseview.store.clear();window.__pulseview.bridge.call('app.ready')");settle(page,400)
    page.evaluate("window.__pulseview.bridge.call('monitor.pause',{paused:true})");settle(page)
    load(page,2);hover(page,1,.45)
    check(page.locator('.core-tile').count()==24 and page.evaluate("[...window.__pulseview.state.chartDebug].some(d=>d.hover)"),'Logical-processor mini-charts also show a sample value on hover')
    cols=lambda:page.evaluate("getComputedStyle(document.querySelector('.core-grid')).gridTemplateColumns.split(' ').length")
    rows=lambda:page.evaluate("getComputedStyle(document.querySelector('.core-grid')).gridTemplateRows.split(' ').length")
    auto=cols()
    page.locator('.grid-size [data-step="1"]').click();settle(page)
    check(cols()==auto+1 and page.locator('[data-grid=coreColumns]').input_value()==str(auto+1),'Header + button steps up from the automatic column count')
    page.locator('.grid-size [data-step="-1"]').click();page.locator('.grid-size [data-step="-1"]').click();settle(page)
    check(cols()==auto-1,'Header - button steps the column count down')
    page.locator('[data-grid=coreColumns]').fill('6');page.locator('[data-grid=coreColumns]').press('Enter');settle(page)
    check(cols()==6 and rows()==4,'Typed column count is used and rows follow from the 24 threads')
    page.set_viewport_size({'width':1000,'height':700});settle(page,300);check(cols()==6 and rows()==4,'Manual columns do not switch when the window resizes')
    page.locator('[data-grid=coreColumns]').fill('');page.locator('[data-grid=coreColumns]').press('Enter');settle(page)
    hb=page.locator('.pane').nth(1).locator('.pane-header').bounding_box();gb=page.locator('.grid-size').bounding_box()
    check(gb['x']+gb['width']>hb['x']+hb['width']-12,'Column control sits at the right end of the widget header')
    page.set_viewport_size({'width':720,'height':390});settle(page,300)
    page.mouse.move(1,1);load(page,3);hover(page,0,.58)
    check(state(page,'chartDebug')[0]['hover']['text'].endswith('B/s'),'Network hover label defaults to scaled bytes/sec')
    page.mouse.move(1,1);load(page,1);baseline=tree(page)
    # Verify all eight CSS skins and real rendering, not just static swatches.
    for name in ['midnight','graphite','onyx','aurora','amethyst','cobalt','ember','ivory']:
        page.locator('#theme-button').click();settle(page)
        check(page.locator('[data-theme-id]').count()==8,'Eight installed skin choices are available ('+name+')')
        page.locator('[data-theme-id='+name+']').click();settle(page);page.keyboard.press('Escape');settle(page)
        check(page.locator('html').get_attribute('data-theme')==name and tree(page)==baseline,'Skin changes chart colors without changing split geometry ('+name+')')
        page.mouse.move(1,1);shot(page,'skin-'+name+'.png')
    page.locator('#theme-button').click();page.locator('[data-theme-id=midnight]').click();page.keyboard.press('Escape');settle(page)
    # CSS import path and per-widget explicit overrides survive skin switches.
    page.evaluate("window.__pulseview.bridge.call('themes.install',{id:'custom-test',name:'Custom test',css:':root { --gpu:#33ff99; --gpu-fill-top:#33ff99; --gpu-fill-mid:#165a56; --gpu-fill-bottom:#122c37; }'})")
    page.locator('#theme-button').click();settle(page);page.locator('[data-theme-id=custom-test]').click();page.keyboard.press('Escape');settle(page)
    check(state(page,'chartDebug')[1]['style'][0]['color']=='#33ff99','Installed CSS skin recolors real Canvas lines without rebuilding')
    page.locator('#theme-button').click();page.locator('[data-theme-id=midnight]').click();page.keyboard.press('Escape');settle(page)
    # A user who saved subdued colors in 1.0 can explicitly reset only styling.
    ident=page.locator('.pane').first.get_attribute('data-pane');page.evaluate('(id)=>window.__pulseview.showWidgetSettings(id)',ident)
    page.locator('input[name=lineColor]').fill('#112233');page.locator('input[name=fillOpacity]').fill('.12')
    page.locator('#reset-chart-style').click()
    check(page.locator('input[name=lineColor]').input_value()=='' and float(page.locator('input[name=fillOpacity]').input_value())==.44,'Use skin chart style resets only appearance overrides')
    page.locator('#apply-widget').click();settle(page)
    # Compressed time axis: toolbar toggle switches mode and the follow-app history.
    load(page,0);settle(page,300)
    page.locator('#compress-button').click();settle(page,300)
    dbg=state(page,'chartDebug')[0]['options']
    check(state(page,'settings.timeCompression') and dbg['warp']=={'start':.25,'factor':4} and dbg['seconds']==600,'Toolbar switches every chart to the compressed axis with its own 600 s history')
    shot(page,'compressed-axis.png')
    page.locator('#compress-button').click();settle(page,300)
    dbg=state(page,'chartDebug')[0]['options']
    check(not state(page,'settings.timeCompression') and dbg['warp'] is None and dbg['seconds']==120,'Normal mode restores the linear axis and the 120 s history')
    # Equalize sizes: only the clicked pane's same-direction run changes.
    load(page,0);page.set_viewport_size({'width':1320,'height':830});settle(page,300)
    boxes=lambda:page.locator('.pane').evaluate_all('(a)=>a.map(e=>{const r=e.getBoundingClientRect();return [e.dataset.pane,r.x,r.y,r.width,r.height]})')
    before_boxes={b[0]:b[1:] for b in boxes()}
    top_ids=[k for k,v in before_boxes.items() if abs(v[1]-min(x[1] for x in before_boxes.values()))<2]
    page.locator('.pane').first.click(button='right');settle(page);page.get_by_role('menuitem',name='Equalize sizes').click();settle(page,300)
    after_boxes={b[0]:b[1:] for b in boxes()}
    widths=[after_boxes[k][2] for k in top_ids]
    check(len(top_ids)>=3 and max(widths)-min(widths)<1.5,'Equalize sizes gives every pane in the top row the same width')
    check(all(after_boxes[k]==before_boxes[k] for k in before_boxes if k not in top_ids),'Equalize sizes leaves panes outside that row untouched')
    page.keyboard.press('Control+z');settle(page)
    # All leaves remain reachable when compact mode is resized below tree minima.
    load(page,0);before=tree(page);page.keyboard.press('Control+Shift+C');settle(page)
    page.set_viewport_size({'width':470,'height':300});settle(page)
    check(page.locator('.pane').count()==9 and tree(page)==before,'Compact shrinking never removes or rewrites an overview pane')
    dims=page.locator('.pane').evaluate_all('(a)=>a.map(e=>({w:e.clientWidth,h:e.clientHeight,d:getComputedStyle(e).display}))')
    check(all(x['w']>0 and x['h']>0 and x['d']!='none' for x in dims),'All nine panes retain positive dimensions with scroll fallback')
    fill_errors=page.locator('.split-node').evaluate_all('''els=>els.map(e=>{const vertical=e.querySelector(':scope > .splitter').classList.contains('y'),size=vertical?'height':'width';return Math.abs(e.getBoundingClientRect()[size]-Array.from(e.children).reduce((s,c)=>s+c.getBoundingClientRect()[size],0))})''')
    check(all(v<1.5 for v in fill_errors),'Minimum-sized siblings never leave unallocated blank grid tracks')
    page.evaluate("window.__pulseview.bridge.write('themes',[])")
    page.set_viewport_size({'width':1320,'height':830});page.keyboard.press('Escape');settle(page);shot(page,'overview.png')
    page.keyboard.press('Control+Shift+C');settle(page);shot(page,'overview-compact.png')
    page.keyboard.press('Escape');page.locator('#theme-button').click();settle(page);shot(page,'themes.png');page.keyboard.press('Escape')
    # Persian keyboard layout: Ctrl+S reports key 'س' but code 'KeyS'.
    page.keyboard.press('Escape');settle(page)
    page.evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'س',code:'KeyS',ctrlKey:true,bubbles:true}))");settle(page)
    name=page.locator('#save-form input[name=name]')
    check(name.is_visible(),'Ctrl+S opens Save on a Persian keyboard layout (physical key code)')
    check(name.get_attribute('dir')=='auto','Preset name field follows the typed text direction (Persian RTL)')
    name.fill('سلام test');check(name.input_value()=='سلام test','Persian and Latin text can be typed into the preset name')
    page.keyboard.press('Escape');settle(page)
    expected_version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    check(page.locator('#app-version').inner_text()=='v'+expected_version,'Footer displays the current application version')
    page.locator('#help-button').click();settle(page)
    check(page.locator('#about-version').inner_text()=='PulseView '+expected_version,'About dialog displays the same current application version')
    page.keyboard.press('Escape');settle(page)
    check(not errors,'No uncaught JavaScript errors in revision interaction suite')
    result={'passed':len(checks),'checks':checks,'javascriptErrors':errors,'environment':'Actual frontend, headless Chromium, trusted-asset harness with simulated readings. No native Windows execution.'}
    (OUTPUT/'revision-browser-test-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    browser.close()
print('\n'+str(len(checks))+' revision interaction checks passed.')
