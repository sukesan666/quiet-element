const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
async function until(fn,timeout=8000){
 const end=Date.now()+timeout;
 while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,50));}
 throw Error('Timed out waiting for native extension state');
}
async function native({granted=false}={}){
 const projectRoot=path.resolve(__dirname,'../..');
 const temp=await fs.mkdtemp(path.join(__dirname,'../../.native-'));
 const removeTemp=async()=>{const resolved=path.resolve(temp);if(path.dirname(resolved)!==projectRoot||!path.basename(resolved).startsWith('.native-'))throw Error('Unsafe test cleanup path');await fs.rm(resolved,{recursive:true,force:true});};
 const extension=path.join(temp,'extension');await fs.cp(path.join(__dirname,'../../extension'),extension,{recursive:true});
 if(granted){const f=path.join(extension,'manifest.json'),m=JSON.parse(await fs.readFile(f,'utf8'));m.host_permissions=['http://example.test/*','https://example.test/*'];await fs.writeFile(f,JSON.stringify(m));}
 let context;
 try{
  context=await chromium.launchPersistentContext(path.join(temp,'profile'),{headless:true,executablePath:process.env.EXTENSION_CHROME_PATH||process.env.CHROME_PATH,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
  const cdp=await context.browser().newBrowserCDPSession();
  const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension});
  const worker=context.serviceWorkers().find(w=>w.url().includes(id))||await context.waitForEvent('serviceworker',{predicate:w=>w.url().includes(id),timeout:10000});
  const close=async()=>{await context.close();await removeTemp();};
  const page=await context.newPage(),exceptions=[];
  await page.route('**://example.test/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body><h1>Test news</h1><div id="sponsor" style="display:block!important;width:240px;height:100px;background:#eee">Advertisement</div><a id="article" href="/next">Article</a><div id="container"><iframe id="frame-ad" src="https://other.test/"></iframe></div><p id="counter">0</p><script>document.querySelector("#article").onclick=()=>document.querySelector("#counter").textContent="clicked"</script></body></html>'}));
  await page.route('https://other.test/**',r=>r.fulfill({contentType:'text/html',body:'<button>Cross-origin iframe advertisement</button>'}));
  const pageCDP=await context.newCDPSession(page);await pageCDP.send('Runtime.enable');pageCDP.on('Runtime.exceptionThrown',e=>exceptions.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
  return {context,cdp,id,worker,page,exceptions,close};
 }catch(e){await context?.close();await removeTemp();throw e;}
}
async function popup(env){
 const {page,cdp,id}=env;await page.bringToFront();
 const old=(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.url===`chrome-extension://${id}/popup.html`);
 for(const target of old)await cdp.send('Target.closeTarget',{targetId:target.targetId}).catch(()=>{});
 if(old.length)await until(async()=>!(await cdp.send('Target.getTargets')).targetInfos.some(t=>t.url===`chrome-extension://${id}/popup.html`));
 const target=(await cdp.send('Target.getTargets',{filter:[{}]})).targetInfos.find(t=>t.type==='tab'&&t.url===page.url());
 await cdp.send('Extensions.triggerAction',{id,targetId:target.targetId});
 const info=await until(async()=>(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url===`chrome-extension://${id}/popup.html`));
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:info.targetId,flatten:false});
 let sequence=0;
 const rpc=(method,params={})=>new Promise((resolve,reject)=>{
  const requestId=++sequence;const timeout=setTimeout(()=>{cdp.off('Target.receivedMessageFromTarget',receive);reject(Error('Popup protocol timeout'));},10000);
  const receive=event=>{if(event.sessionId!==sessionId)return;const response=JSON.parse(event.message);if(response.id!==requestId)return;clearTimeout(timeout);cdp.off('Target.receivedMessageFromTarget',receive);response.error?reject(Error(response.error.message)):resolve(response.result);};
  cdp.on('Target.receivedMessageFromTarget',receive);cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:requestId,method,params})}).catch(e=>{clearTimeout(timeout);cdp.off('Target.receivedMessageFromTarget',receive);reject(e);});
 });
 const evaluate=async expression=>{const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
 await until(()=>evaluate('Boolean(document.getElementById("pick") && !document.getElementById("pick").disabled && document.getElementById("host").textContent === "example.test")'));
 return {evaluate,click:()=>evaluate('document.getElementById("pick").click()'),close:()=>cdp.send('Target.closeTarget',{targetId:info.targetId})};
}
module.exports={native,popup,until};
