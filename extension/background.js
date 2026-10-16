importScripts('model.js');
const M = QEModel;
let queue = Promise.resolve();
const read = async () => (await chrome.storage.local.get('state')).state || M.empty();
const run = job => { const p = queue.then(job); queue = p.catch(()=>{}); return p; };
async function syncRegistrations(state) {
  const hosts = Object.entries(state.sites).filter(([,s])=>s.rules.length).map(([h])=>h);
  const desired = [];
  for (const host of hosts) {
    const patterns = [`http://${host}/*`,`https://${host}/*`];
    for (const pattern of patterns) {
      if (await chrome.permissions.contains({origins:[pattern]})) desired.push(pattern);
    }
  }
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const own = registered.filter(r=>r.id === 'qe-auto');
  if (JSON.stringify(own[0]?.matches?.slice().sort() || []) === JSON.stringify(desired.slice().sort())) return;
  if (own.length) await chrome.scripting.unregisterContentScripts({ids:['qe-auto']});
  if (desired.length) await chrome.scripting.registerContentScripts([{id:'qe-auto',matches:desired,js:['core.js','content.js'],runAt:'document_start',allFrames:false,persistAcrossSessions:true}]);
}
async function broadcast() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(t=>chrome.tabs.sendMessage(t.id,{type:'REFRESH'},{frameId:0})));
}
async function start(tab) {
  M.hostOf(tab.url);
  const target={tabId:tab.id,frameIds:[0]};
  // AdBlock's wizard loader initializes its dependencies in order, then explicitly invokes UI.
  await chrome.scripting.executeScript({target,files:['core.js']});
  await chrome.scripting.executeScript({target,files:['content.js']});
  const results=await chrome.scripting.executeScript({target,func:()=>{
    const controller=globalThis.__quietElementController;
    if(controller?.version !== '1.1.0')return {started:false,error:'選択UIの初期化に失敗しました。ページを再読み込みしてお試しください。'};
    try{return controller.start();}catch(e){return {started:false,error:e.message};}
  }});
  const result=results.find(r=>r.frameId===0)?.result;
  if(!result?.started)throw Error(result?.error||'選択UIの起動を確認できませんでした。ページを再読み込みしてお試しください。');
  await chrome.action.setBadgeText({tabId:tab.id,text:''});
}
function trustedUI(sender) {
  return [chrome.runtime.getURL('popup.html'),chrome.runtime.getURL('options.html')].includes(sender.url);
}
async function handle(msg, sender) {
  if (!msg || typeof msg.type !== 'string' || sender.id !== chrome.runtime.id) throw Error('無効な送信元です。');
  const ui = trustedUI(sender);
  const content = !!sender.tab && sender.frameId === 0 && ['http:','https:'].some(p=>sender.url?.startsWith(p));
  if (!ui && !content) throw Error('無効な操作元です。');
  if (msg.type === 'STYLE' && content) {
    if(typeof msg.marker !== 'string' || !/^data-qe-hidden-[a-f0-9]{32}$/.test(msg.marker)) throw Error('非表示属性が無効です。');
    const target=sender.documentId ? {tabId:sender.tab.id,documentIds:[sender.documentId]} : {tabId:sender.tab.id,frameIds:[0]};
    await chrome.scripting.insertCSS({target,css:`[${msg.marker}]{display:none!important}`,origin:'USER'});
    return true;
  }
  if (msg.type === 'GET') {
    const state = await read();
    if (ui) return state;
    const host = M.hostOf(sender.url);
    return {enabled:state.enabled,site:Object.hasOwn(state.sites,host) ? state.sites[host] : {enabled:true,rules:[]}};
  }
  if (msg.type === 'START' && ui) { const tab = await chrome.tabs.get(msg.tabId); await start(tab); return true; }
  if (msg.type === 'SYNC' && ui) { await syncRegistrations(await read()); await broadcast(); return true; }
  if (!ui && msg.type !== 'SAVE') throw Error('この操作は管理画面専用です。');
  const host = ui ? msg.host : M.hostOf(sender.url);
  const state = M.mutate(await read(), msg, host);
  await chrome.storage.local.set({state});
  if(msg.type === 'RESET') {
    const origins = (await chrome.permissions.getAll()).origins || [];
    if(origins.length) await chrome.permissions.remove({origins});
  }
  // Storage is the source of truth. Saving remains successful if registration is temporarily unavailable.
  let warning = '';
  try {await syncRegistrations(state);} catch {warning = '保存済み。自動適用の登録に失敗しました。拡張メニューで再設定してください。';}
  await broadcast();
  return {warning};
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  run(()=>handle(msg,sender)).then(data=>reply({ok:true,data}),e=>reply({ok:false,error:e.message}));
  return true;
});
function repair(){run(async()=>{await syncRegistrations(await read());await broadcast();}).catch(console.error);}
chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:'qe-pick',title:'Quiet Element：要素を選んで非表示',contexts:['page','selection','link','image','video','audio'],documentUrlPatterns:['http://*/*','https://*/*']}));
  repair();
});
chrome.runtime.onStartup.addListener(repair);
chrome.permissions.onAdded.addListener(repair);
chrome.permissions.onRemoved.addListener(repair);
chrome.contextMenus.onClicked.addListener((info,tab)=>{
  if(info.menuItemId !== 'qe-pick')return;
  start(tab).catch(async()=>{
    await chrome.action.setBadgeText({tabId:tab.id,text:'!'});
    await chrome.action.setTitle({tabId:tab.id,title:'このページでは開始できません。拡張メニューを開いてください。'});
  });
});
