const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../extension'),m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(m.manifest_version,3);assert.equal(m.host_permissions,undefined);
for(const p of ['activeTab','scripting','storage','contextMenus'])assert.ok(m.permissions.includes(p));
assert.equal(m.permissions.length,4);
for(const f of [m.background.service_worker,m.action.default_popup,m.options_page,'core.js','content.js','model.js','ui.js','ui.css'])assert.ok(fs.existsSync(path.join(root,f)),f);
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.js')))cp.execFileSync(process.execPath,['--check',path.join(root,f)],{stdio:'inherit'});
for(const name of ['popup.html','options.html'])for(const match of fs.readFileSync(path.join(root,name),'utf8').matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
console.log('PASS: MV3 manifest, minimal required permissions, referenced assets and all JS syntax.');
