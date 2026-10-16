(() => {
  const $=id=>document.getElementById(id), popup=document.body.classList.contains('popup');
  let tab=null, host=null, loading=false;
  const status=(text,error=false)=>{ $('status').textContent=text;$('status').classList.toggle('error',error); };
  const send=async msg=>{const r=await chrome.runtime.sendMessage(msg);if(!r?.ok)throw Error(r?.error||'操作に失敗しました。');return r.data;};
  function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
  function button(text,fn){const b=node('button',text);b.onclick=()=>act(fn);return b;}
  function toggle(text,value,fn){const label=node('label',undefined,'switch'),input=node('input');input.type='checkbox';input.checked=value;input.onchange=()=>act(()=>fn(input.checked));label.append(input,document.createTextNode(text));return label;}
  async function act(fn){
    if(loading)return;loading=true;
    const buttons=[...document.querySelectorAll('button,input')];buttons.forEach(b=>b.disabled=true);
    try{const result=await fn();status(result?.warning || '更新しました。');}
    catch(e){status(e.message,true);}
    finally{loading=false;buttons.forEach(b=>b.disabled=false);await render();}
  }
  async function render(){
    try {
      const state=await send({type:'GET'});
      $('global').checked=state.enabled;
      const list=$('rules');list.replaceChildren();
      const entries=popup ? (host&&Object.hasOwn(state.sites,host)?[[host,state.sites[host]]]:[]) : Object.entries(state.sites).sort(([a],[b])=>a.localeCompare(b));
      if(!entries.length)list.append(node('p','保存ルールはありません。','empty'));
      for(const [siteHost,site] of entries){
        const section=node('section');section.append(node('h2',siteHost));
        section.append(toggle('このサイトのルールを有効にする',site.enabled,v=>send({type:'SITE',host:siteHost,enabled:v})));
        if(!state.enabled)section.append(node('p','拡張全体が一時停止中です。','meta'));
        if(!popup){
          const permitted=await chrome.permissions.contains({origins:[`*://${siteHost}/*`]});
          section.append(node('p',permitted?'自動適用：許可済み':'自動適用：サイトの許可が必要です。該当サイトを開いて拡張メニューから許可してください。','meta'));
          if(permitted)section.append(button('サイトへのアクセス許可を解除',async()=>{await chrome.permissions.remove({origins:[`*://${siteHost}/*`]});await send({type:'SYNC'});}));
        }
        for(const rule of site.rules){
          const row=node('div',undefined,'rule');
          row.append(toggle('このルールを有効にする',rule.enabled,v=>send({type:'TOGGLE',host:siteHost,id:rule.id,enabled:v})),node('code',rule.selector));
          row.append(node('p',rule.fragile?'位置に依存：並び順の変更に注意':'一意に一致する要素だけに適用','meta'));
          row.append(button('削除',()=>send({type:'DELETE',host:siteHost,id:rule.id})));section.append(row);
        }
        list.append(section);
      }
      if(popup){
        $('pick').disabled=!host;
        $('grant').disabled=!host;
        $('revoke').disabled=!host;
        if(host){
          const permitted=await chrome.permissions.contains({origins:[`*://${host}/*`]});
          $('permissionStatus').textContent=permitted?'このホストのHTTP/HTTPSで許可済みです。':'未許可。今のページでの選択・保存は可能です。再訪問時は下の許可が必要です。';
          $('grant').hidden=permitted;$('revoke').hidden=!permitted;
        }else $('permissionStatus').textContent='通常のWebページでご利用ください。';
      }
    }catch(e){status(e.message,true);}
  }
  $('global').onchange=()=>act(()=>send({type:'GLOBAL',enabled:$('global').checked}));
  if(popup){
    $('pick').onclick=()=>act(async()=>{await send({type:'START',tabId:tab.id});window.close();});
    // Request synchronously in the user gesture; do not put asynchronous work before it.
    $('grant').onclick=()=>{
      if(!host||loading)return;
      const request=chrome.permissions.request({origins:[`*://${host}/*`]});
      act(async()=>{if(!await request)throw Error('アクセスは許可されませんでした。ルールは保存したままです。');await send({type:'SYNC'});await chrome.scripting.executeScript({target:{tabId:tab.id},files:['core.js','content.js']});});
    };
    $('revoke').onclick=()=>act(async()=>{await chrome.permissions.remove({origins:[`*://${host}/*`]});await send({type:'SYNC'});});
    $('manage').onclick=()=>chrome.runtime.openOptionsPage();
    chrome.tabs.query({active:true,currentWindow:true}).then(async tabs=>{
      tab=tabs[0];try{host=QEModel.hostOf(tab?.url);$('host').textContent=host;}catch(e){$('host').textContent='対象外のページ';status(e.message,true);}await render();
    }).catch(e=>status(e.message,true));
  }else{
    $('reset').onclick=()=>{if(confirm('すべてのサイトのルール・設定・サイトアクセス許可を初期化します。元に戻せません。実行しますか？'))act(()=>send({type:'RESET'}));};
    render();
  }
  chrome.storage.onChanged.addListener((_c,area)=>{if(area==='local'&&!loading)render();});
})();
