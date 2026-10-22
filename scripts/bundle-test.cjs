// Offline test harness only: convert actual ES modules to a CommonJS bundle.
// The shipped Windows app serves the original modules, with no bundling step.
const fs=require('fs'),path=require('path'),os=require('os'),childProcess=require('child_process');
let ts;
try { ts = require('typescript'); }
catch {
  try {
    const globalRoot = childProcess.execSync('npm root -g', {encoding:'utf8'}).trim();
    ts = require(path.join(globalRoot, 'typescript'));
  } catch {
    throw new Error('Optional UI tests need TypeScript. Run: npm install --no-save typescript');
  }
}
const root=path.join(__dirname,'..','ui');
const modules={};
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.name.endsWith('.js')){const id=path.relative(root,file).replaceAll('\\','/');modules[id]=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}}}
walk(root);
const body=Object.entries(modules).map(([id,code])=>`${JSON.stringify(id)}:function(require,module,exports){\n${code}\n}`).join(',\n');
const out=`(()=>{const modules={${body}};const cache={};function load(id){if(cache[id])return cache[id].exports;if(!modules[id])throw new Error('Missing module '+id);const m={exports:{}};cache[id]=m;const req=p=>{const seg=(id.split('/').slice(0,-1).join('/')+'/'+p).split('/');const out=[];for(const x of seg)if(x==='..')out.pop();else if(x&&x!=='.')out.push(x);return load(out.join('/'));};modules[id](req,m,m.exports);return m.exports;}load('app.js');})();`;
fs.writeFileSync(process.argv[2]||path.join(os.tmpdir(),'pulseview-test-bundle.js'),out);
