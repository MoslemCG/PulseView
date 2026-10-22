import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
function files(p){return readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(p,e.name)):[join(p,e.name)]);}
let failed=false;
if(spawnSync(process.execPath,['scripts/sync-version.mjs','--check'],{stdio:'inherit'}).status)failed=true;
for(const f of files('ui').filter(x=>x.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',f],{stdio:'inherit'});if(r.status)failed=true;}
process.exitCode=failed?1:0;
