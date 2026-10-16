const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {native,popup,until}=require('./helpers/native.cjs');
const {hover,choose}=require('./helpers/pointer.cjs');
for(const scheme of ['http','https'])test(`native ${scheme}: production manifest, real toolbar popup starts picker without persistent site permission`,async()=>{
 const env=await native();try{
  const {page,worker}=env;await page.goto(`${scheme}://example.test/`);
  assert.equal((await worker.evaluate(()=>chrome.permissions.getAll())).origins?.length||0,0);
  const ui=await popup(env);await ui.click();
  await until(async()=>await page.locator('[data-qe-ui]').count()===1);
  await hover(page,'#sponsor');await choose(page,'#sponsor');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#sponsor')).display==='none');
  if(scheme==='http')await page.screenshot({path:path.join(__dirname,'../docs/picker-native.png')});
  await page.getByRole('button',{name:'キャンセル'}).click();assert.equal(await page.locator('#sponsor').isVisible(),true);
  await page.reload();const second=await popup(env);await second.click();await until(async()=>await page.locator('[data-qe-ui]').count()===1);
  await page.keyboard.press('Escape');assert.deepEqual(env.exceptions,[]);
 }finally{await env.close();}
});
test('native: save, reload, dynamic DOM, USER CSS and real options messaging',async()=>{
 const env=await native({granted:true});try{
  const {page,worker,context,id}=env;await page.goto('http://example.test/');
  const ui=await popup(env);await ui.click();await until(async()=>await page.locator('[data-qe-ui]').count()===1);
  await choose(page,'#article');assert.equal(page.url(),'http://example.test/');assert.equal(await page.locator('#counter').textContent(),'0');await page.keyboard.press('Escape');
  const second=await popup(env);await second.click();await until(async()=>await page.locator('[data-qe-ui]').count()===1);
  await choose(page,'#sponsor');await page.getByRole('button',{name:'確定して保存'}).click();await page.locator('[data-qe-ui]').waitFor({state:'detached'});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#sponsor')).display==='none');
  const state=await worker.evaluate(async()=>(await chrome.storage.local.get('state')).state);assert.equal(state.sites['example.test'].rules[0].selector,'#sponsor');
  const regs=await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());assert.ok(regs.some(r=>r.matches.includes('http://example.test/*')));
  await page.reload();await page.waitForFunction(()=>getComputedStyle(document.querySelector('#sponsor')).display==='none');
  await page.evaluate(()=>{const e=document.createElement('div');e.id='sponsor';document.body.append(e);});
  await page.waitForFunction(()=>[...document.querySelectorAll('#sponsor')].every(e=>getComputedStyle(e).display!=='none'));
  await page.evaluate(()=>document.querySelectorAll('#sponsor')[1].remove());await page.waitForFunction(()=>getComputedStyle(document.querySelector('#sponsor')).display==='none');
  const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);
  await options.waitForFunction(()=>document.getElementById('status').textContent || document.getElementById('rules').children.length);
  assert.equal(await options.locator('#status.error').count(),0,await options.locator('body').innerText());
  await options.getByText('example.test',{exact:true}).waitFor();
  for(const label of ['拡張全体の非表示を有効にする','このサイトのルールを有効にする','このルールを有効にする']){
   await options.getByLabel(label).uncheck();await page.waitForFunction(()=>getComputedStyle(document.querySelector('#sponsor')).display!=='none');
   await options.getByLabel(label).check();await page.waitForFunction(()=>getComputedStyle(document.querySelector('#sponsor')).display==='none');
  }
  await options.getByRole('button',{name:'削除',exact:true}).click();await options.getByText('保存ルールはありません。').waitFor();await page.waitForFunction(()=>getComputedStyle(document.querySelector('#sponsor')).display!=='none');
  assert.deepEqual(env.exceptions,[]);
 }finally{await env.close();}
});
test('native: iframe outer element can be selected without running inside the cross-origin frame',async()=>{
 const env=await native();try{
  const {page}=env;await page.goto('https://example.test/');const ui=await popup(env);await ui.click();await until(async()=>await page.locator('[data-qe-ui]').count()===1);
  const r=await page.locator('#frame-ad').boundingBox();await page.mouse.move(r.x+15,r.y+15);await page.mouse.click(r.x+15,r.y+15);
  await until(()=>page.evaluate(()=>getComputedStyle(document.querySelector('#frame-ad')).display==='none'),2000);
  assert.match(await page.locator('[data-qe-ui]').locator('#code').innerText(),/frame-ad/);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#frame-ad').isVisible(),true);
 }finally{await env.close();}
});
test('native: failed content initialization reports an error and retries successfully without page reload',async()=>{
 const env=await native();try{
  const {page,worker}=env;await page.goto('http://example.test/');const ui=await popup(env);
  const modify=restore=>worker.evaluate(async restore=>{
   const tab=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
   await chrome.scripting.executeScript({target:{tabId:tab.id},args:[restore],func:restore=>{
    if(restore)Object.defineProperty(crypto,'getRandomValues',{value:globalThis.__originalRandom,configurable:true});
    else{globalThis.__originalRandom=crypto.getRandomValues;Object.defineProperty(crypto,'getRandomValues',{value:()=>{throw Error('injected startup failure');},configurable:true});}
   }});
  },restore);
  await modify(false);await ui.click();await until(()=>ui.evaluate('document.getElementById("status").textContent.includes("初期化に失敗")'));
  assert.equal(await page.locator('[data-qe-ui]').count(),0);
  await modify(true);await ui.click();await until(async()=>await page.locator('[data-qe-ui]').count()===1);
  assert.ok(env.exceptions.some(s=>s.includes('injected startup failure')));await page.keyboard.press('Escape');
 }finally{await env.close();}
});
