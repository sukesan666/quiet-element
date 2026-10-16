const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'../extension');
function worker(origins=[]){
 let state,listener;const registrations=[],sent=[],removed=[],css=[];let failStorage=false;
 const event=()=>({addListener:()=>{}});
 const chrome={runtime:{id:'qe-test',getURL:p=>'chrome-extension://qe-test/'+p,onMessage:{addListener:f=>listener=f},onInstalled:event(),onStartup:event()},
 storage:{local:{get:async()=>({state}),set:async data=>{if(failStorage)throw Error('QUOTA');await new Promise(r=>setTimeout(r,2));state=structuredClone(data.state);}}},
 permissions:{getAll:async()=>({origins}),contains:async({origins:requested})=>requested.every(p=>origins.includes(p)||origins.includes(p.replace(/^https?:/,'*:'))),remove:async({origins:target})=>{removed.push(...target);origins=origins.filter(o=>!target.includes(o));return true;},onAdded:event(),onRemoved:event()},
 scripting:{getRegisteredContentScripts:async()=>structuredClone(registrations),unregisterContentScripts:async()=>{registrations.length=0;},registerContentScripts:async rs=>registrations.push(...rs),executeScript:async()=>{},insertCSS:async details=>css.push(structuredClone(details))},
 tabs:{query:async()=>[{id:42}],sendMessage:async(id,m)=>sent.push({id,m}),get:async()=>({id:42,url:'https://example.test/'})},
 contextMenus:{onClicked:event(),removeAll:()=>{},create:()=>{}},action:{setBadgeText:async()=>{},setTitle:async()=>{}}};
 const ctx=vm.createContext({chrome,console,structuredClone,crypto,URL,Promise,Error,Date,setTimeout});
 ctx.importScripts=p=>vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),ctx);
 const ui={id:'qe-test',url:'chrome-extension://qe-test/options.html'};
 const content={id:'qe-test',url:'https://example.test/article',frameId:0,tab:{id:42}};
 const send=(msg,sender=ui)=>new Promise(resolve=>listener(msg,sender,resolve));
 return {send,ui,content,registrations,sent,removed,css,get state(){return state;},fail(){failStorage=true;}};
}
test('concurrent saves serialized without dropped writes; registration uses only permitted hosts',async()=>{
 const w=worker(['https://example.test/*']);
 const rs=await Promise.all(['#sponsor','#sidebar'].map(selector=>w.send({type:'SAVE',selector},w.content)));
 assert.ok(rs.every(r=>r.ok));assert.equal(w.state.sites['example.test'].rules.length,2);
 assert.deepEqual(Array.from(w.registrations[0].matches),['https://example.test/*']);
 assert.equal(w.registrations[0].allFrames,false);assert.equal(w.registrations[0].runAt,'document_start');
});
test('untrusted sender and iframe cannot change state; content cannot mutate other hosts or global settings',async()=>{
 const w=worker();
 for(const sender of [{id:'foreign',url:w.ui.url},{...w.content,frameId:1},{...w.ui,url:'https://evil.test/'}])assert.equal((await w.send({type:'RESET'},sender)).ok,false);
 assert.equal((await w.send({type:'GLOBAL',enabled:false},w.content)).ok,false);
 await w.send({type:'SAVE',host:'evil.test',selector:'#sponsor'},w.content);
 assert.deepEqual(Object.keys(w.state.sites),['example.test']);
});
test('no persistent host access means no automatic registration; later sync repairs it',async()=>{
 const w=worker();await w.send({type:'SAVE',selector:'#sponsor'},w.content);
 assert.equal(w.registrations.length,0);
 const result=await w.send({type:'GET'},w.content);assert.equal(result.data.site.rules.length,1);assert.equal(result.data.sites,undefined);
});
test('storage failure is reported and does not invent a saved rule',async()=>{
 const w=worker();w.fail();const r=await w.send({type:'SAVE',selector:'#sponsor'},w.content);
 assert.equal(r.ok,false);assert.match(r.error,/QUOTA/);assert.equal(w.state,undefined);
});
test('reset clears storage, registrations and granted optional origins',async()=>{
 const w=worker(['https://example.test/*']);await w.send({type:'SAVE',selector:'#sponsor'},w.content);
 assert.equal((await w.send({type:'RESET'})).ok,true);
 assert.deepEqual(w.state,{version:1,enabled:true,sites:{}});assert.equal(w.registrations.length,0);assert.deepEqual(w.removed,['https://example.test/*']);
});
test('hiding CSS is user origin, document scoped and cannot inject arbitrary selectors',async()=>{
 const w=worker(),sender={...w.content,documentId:'document-1'};
 const result=await w.send({type:'STYLE',marker:'data-qe-hidden-0123456789abcdef0123456789abcdef'},sender);
 assert.equal(result.ok,true);assert.equal(w.css.length,1);assert.equal(w.css[0].origin,'USER');
 assert.deepEqual(w.css[0].target,{tabId:42,documentIds:['document-1']});
 assert.equal(w.css[0].css,'[data-qe-hidden-0123456789abcdef0123456789abcdef]{display:none!important}');
 assert.equal((await w.send({type:'STYLE',marker:'x]{display:none}body'},sender)).ok,false);
 assert.equal(w.css.length,1);
});
test('real extension options tab is trusted even when sender.tab is populated',async()=>{
 const w=worker();const response=await w.send({type:'GET'},{...w.ui,tab:{id:90},frameId:0});
 assert.equal(response.ok,true);
});
