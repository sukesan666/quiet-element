const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const {hover,choose}=require('./helpers/pointer.cjs');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});});
after(async()=>{await browser?.close();});
const root=path.join(__dirname,'../extension');
async function pageWithRuntime(){
 const p=await browser.newPage({viewport:{width:1100,height:800}});
 await p.route('https://example.test/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body><h1>ニュース</h1><div id="sponsor" style="width:240px;height:100px;background:#eee">広告</div><a id="article" href="/next">記事を開く</a><p id="counter">0</p><script>document.querySelector("#article").onclick=()=>document.querySelector("#counter").textContent="clicked"</script></body></html>'}));
 await p.goto('https://example.test/');
 await p.addScriptTag({path:path.join(root,'model.js')});
 await p.evaluate(()=>{
  window.testState=QEModel.empty();window.testFail=false;window.testListeners=[];
  // Boundary adapter only: the production content and model run unchanged in a real browser DOM.
  window.chrome={runtime:{sendMessage:async msg=>{
   if(msg.type==='STYLE')return {ok:true,data:true};
   if(msg.type==='GET')return {ok:true,data:{enabled:testState.enabled,site:testState.sites['example.test']||{enabled:true,rules:[]}}};
   if(testFail)return {ok:false,error:'テスト用保存エラー'};
   testState=QEModel.mutate(testState,msg,'example.test');return {ok:true,data:{warning:''}};
  },onMessage:{addListener:fn=>testListeners.push(fn)}},storage:{onChanged:{addListener:()=>{}}}};
  window.testMessage=msg=>testListeners.forEach(fn=>fn(msg,{},()=>{}));
 });
 await p.addScriptTag({path:path.join(root,'core.js')});
 await p.addScriptTag({path:path.join(root,'content.js')});
 return p;
}
async function start(p){await p.evaluate(()=>testMessage({type:'START'}));await p.locator('[data-qe-ui]').waitFor();}
async function display(p,visible){await p.waitForFunction(v=>(getComputedStyle(document.querySelector('#sponsor')).display!=='none')===v,visible);}
test('hover, click preview, cancel and Escape restore without navigation',async()=>{
 const p=await pageWithRuntime();await start(p);
 await hover(p,'#sponsor');assert.equal(await p.locator('[data-qe-ui]').locator('#box').isVisible(),true);
 await choose(p,'#sponsor');await display(p,false);
 await p.screenshot({path:path.join(__dirname,'../docs/picker-preview.png')});
 await p.getByRole('button',{name:'キャンセル'}).click();await display(p,true);
 assert.equal(await p.evaluate(()=>Object.keys(testState.sites).length),0);
 await start(p);await choose(p,'#article');assert.equal(p.url(),'https://example.test/');assert.equal(await p.locator('#counter').textContent(),'0');
 await p.keyboard.press('Escape');assert.equal(await p.locator('#article').isVisible(),true);
 await p.close();
});
test('save, duplicate selection start, reapply and live ambiguous DOM fail open',async()=>{
 const p=await pageWithRuntime();await start(p);await start(p);assert.equal(await p.locator('[data-qe-ui]').count(),1);
 await choose(p,'#sponsor');await p.getByRole('button',{name:'確定して保存'}).click();await p.locator('[data-qe-ui]').waitFor({state:'detached'});await display(p,false);
 assert.equal(await p.evaluate(()=>testState.sites['example.test'].rules[0].selector),'#sponsor');
 await p.evaluate(()=>{const el=document.createElement('div');el.id='sponsor';el.textContent='Second';document.body.append(el);});
 await p.waitForFunction(()=>[...document.querySelectorAll('#sponsor')].every(e=>getComputedStyle(e).display!=='none'));
 await p.evaluate(()=>document.querySelectorAll('#sponsor')[1].remove());await display(p,false);
 for(const [field,value,visible] of [['enabled',false,true],['enabled',true,false]]){
  await p.evaluate(([f,v])=>{testState[f]=v;testMessage({type:'REFRESH'});},[field,value]);await display(p,visible);
 }
 await p.evaluate(()=>{testState.sites['example.test'].rules=[];testMessage({type:'REFRESH'});});await display(p,true);
 await p.close();
});
test('save error rolls back and leaves actionable UI',async()=>{
 const p=await pageWithRuntime();await start(p);await choose(p,'#sponsor');await display(p,false);
 await p.evaluate(()=>testFail=true);await p.getByRole('button',{name:'確定して保存'}).click();
 await p.getByRole('status').filter({hasText:'保存できませんでした'}).waitFor();await display(p,true);
 assert.equal(await p.getByRole('button',{name:'確定して保存'}).isDisabled(),true);
 await p.getByRole('button',{name:'キャンセル'}).click();await p.close();
});
test('reselect restores preview and keyboard Tab stays in controls',async()=>{
 const p=await pageWithRuntime();await start(p);await choose(p,'#sponsor');
 await p.getByRole('button',{name:'選び直す'}).click();await display(p,true);
 await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement?.hasAttribute('data-qe-ui')),true);
 await p.keyboard.press('Escape');await p.close();
});
test('saved rule loads in fresh content runtime (revisit)',async()=>{
 const p=await pageWithRuntime();
 await p.evaluate(()=>{testState=QEModel.mutate(testState,{type:'SAVE',selector:'#sponsor'},'example.test');testMessage({type:'REFRESH'});});await display(p,false);
 // New document: recreate adapter with persisted data, then run actual content on initial load.
 const state=await p.evaluate(()=>testState);await p.reload();await p.addScriptTag({path:path.join(root,'model.js')});
 await p.evaluate(s=>{window.chrome={runtime:{sendMessage:async m=>m.type==='STYLE'?({ok:true,data:true}):({ok:true,data:{enabled:s.enabled,site:s.sites['example.test']}}),onMessage:{addListener:()=>{}}},storage:{onChanged:{addListener:()=>{}}}};},state);
 await p.addScriptTag({path:path.join(root,'core.js')});await p.addScriptTag({path:path.join(root,'content.js')});await display(p,false);await p.close();
});
