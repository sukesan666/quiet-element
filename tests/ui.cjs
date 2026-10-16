const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.join(__dirname,'../extension');let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});});
after(async()=>{await browser?.close();});
async function ui(file){
 const p=await browser.newPage({viewport:{width:1000,height:900}});
 await p.route('https://ui.test/**',async r=>{
  const name=new URL(r.request().url()).pathname.slice(1)||file;
  try{await r.fulfill({body:await fs.readFile(path.join(root,name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});}catch{await r.abort();}
 });
 await p.addInitScript(()=>{
  window.fixture={version:1,enabled:true,sites:{'example.test':{enabled:true,rules:[{id:'rule-1',selector:'#sponsor',enabled:true,fragile:false,created:0}]}}};
  window.chrome={runtime:{sendMessage:async m=>{
   if(m.type==='GET')return {ok:true,data:fixture};
   if(m.type==='SYNC')return {ok:true,data:true};
   fixture=QEModel.mutate(fixture,m,m.host);return {ok:true,data:{warning:''}};
  },openOptionsPage:()=>{}},permissions:{contains:async()=>false,request:async()=>false,remove:async()=>true},tabs:{query:async()=>[{id:7,url:'https://example.test/'}]},storage:{onChanged:{addListener:()=>{}}},scripting:{executeScript:async()=>{}}};
 });
 await p.goto('https://ui.test/'+file);await p.getByLabel('このルールを有効にする').waitFor();return p;
}
test('management toggles rule, site and global, and deletes individual rule',async()=>{
 const p=await ui('options.html');
 await p.getByLabel('このルールを有効にする').uncheck();await p.waitForFunction(()=>!fixture.sites['example.test'].rules[0].enabled);
 await p.getByLabel('このサイトのルールを有効にする').uncheck();await p.waitForFunction(()=>!fixture.sites['example.test'].enabled);
 await p.getByLabel('拡張全体の非表示を有効にする').uncheck();await p.waitForFunction(()=>!fixture.enabled);
 await p.getByRole('button',{name:'削除',exact:true}).click();await p.getByText('保存ルールはありません。').waitFor();
 await p.close();
});
test('reset cancel preserves rules; confirmation clears rules',async()=>{
 const p=await ui('options.html');p.once('dialog',d=>d.dismiss());await p.getByRole('button',{name:'全件初期化する…'}).click();
 assert.equal(await p.getByLabel('このルールを有効にする').count(),1);
 p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'全件初期化する…'}).click();
 await p.getByText('保存ルールはありません。').waitFor();assert.equal(await p.evaluate(()=>fixture.enabled),true);await p.close();
});
test('popup permission denial keeps saved rules and shows actionable error',async()=>{
 const p=await ui('popup.html');await p.locator('body').screenshot({path:path.join(__dirname,'../docs/popup-preview.png')});
 await p.getByRole('button',{name:'このサイトで自動適用を許可'}).click();
 await p.getByRole('status').filter({hasText:'アクセスは許可されませんでした'}).waitFor();
 assert.equal(await p.getByLabel('このルールを有効にする').count(),1);
 assert.equal(await p.getByRole('button',{name:'ページの要素を選ぶ'}).isEnabled(),true);
 await p.close();
});
