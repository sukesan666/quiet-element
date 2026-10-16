const {test, before, after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root=path.join(__dirname,'../extension');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});});
after(async()=>{await browser?.close();});
async function fixture(html){
 const page=await browser.newPage();
 await page.route('https://example.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('https://example.test/');
 if(fs.existsSync(path.join(root,'core.js')))await page.addScriptTag({path:path.join(root,'core.js')});
 return page;
}
test('unique stable ID survives sibling insertion',async()=>{
 const p=await fixture('<div id="sponsor">Ad</div><div>Article</div>');
 assert.equal(await p.evaluate(()=>typeof globalThis.QE?.selector),'function');
 assert.equal(await p.evaluate(()=>QE.selector(document.querySelector('#sponsor')).selector),'#sponsor');
 await p.evaluate(()=>{const s=document.createElement('div');s.textContent='New sibling';document.body.prepend(s);});
 assert.equal(await p.locator('#sponsor').textContent(),'Ad');
 await p.close();
});
test('duplicate classes do not select unrelated cards',async()=>{
 const p=await fixture('<section><div class="card">Ad</div><div class="card">News</div></section>');
 assert.equal(await p.evaluate(()=>typeof globalThis.QE?.selector),'function');
 assert.equal(await p.evaluate(()=>{const e=document.querySelector('.card');const r=QE.selector(e);return document.querySelectorAll(r.selector).length===1&&document.querySelector(r.selector)===e;}),true);
 await p.close();
});
test('roots and main landmark are never selectable',async()=>{
 const p=await fixture('<main><p>Content</p></main>');
 assert.equal(await p.evaluate(()=>typeof globalThis.QE?.selector),'function');
 assert.deepEqual(await p.evaluate(()=>[document.body,document.documentElement,document.querySelector('main')].map(e=>QE.selector(e))),[null,null,null]);
 await p.close();
});
test('malformed and broad selectors fail open',async()=>{
 const p=await fixture('<div class="card">A</div><div class="card">B</div>');
 assert.equal(await p.evaluate(()=>typeof globalThis.QE?.resolve),'function');
 assert.deepEqual(await p.evaluate(()=>['.card','body','[','html > body','*'].map(s=>QE.resolve(s)===null)),[true,true,true,true,true]);
 await p.close();
});
test('special ID characters are escaped',async()=>{
 const p=await fixture('<div id="ad:slot">Ad</div>');
 assert.equal(await p.evaluate(()=>typeof globalThis.QE?.selector),'function');
 assert.equal(await p.evaluate(()=>{let e=document.getElementById('ad:slot');return document.querySelector(QE.selector(e).selector)===e;}),true);
 await p.close();
});
test('shadow interior is rejected',async()=>{
 const p=await fixture('<div id="host"></div>');
 assert.equal(await p.evaluate(()=>typeof globalThis.QE?.selector),'function');
 assert.equal(await p.evaluate(()=>{let r=document.querySelector('#host').attachShadow({mode:'open'});r.innerHTML='<b>Ad</b>';return QE.selector(r.firstChild);}),null);
 await p.close();
});
test('saved selector resolving to a huge replacement container fails open',async()=>{
 const p=await fixture('<div id="sponsor" style="width:100vw;height:100vh">Full page</div>');
 assert.equal(await p.evaluate(()=>QE.resolve('#sponsor')),null);
 await p.close();
});
