(() => {
  const version='1.1.0';
  if (globalThis.__quietElementController?.version === version) return;
  globalThis.__quietElementController?.dispose();
  const marker = 'data-qe-hidden-' + QE.token();
  const style = document.createElement('style');
  style.textContent = `[${marker}]{display:none!important}`;
  let state = {enabled:true,site:{enabled:true,rules:[]}}, hidden = new Set(), preview = null;
  let picker = null, highlighted = null, candidate = null, timer = null, busy = false, generation = 0, userStyle = null;
  const send = async msg => {
    const r = await chrome.runtime.sendMessage(msg);
    if (!r?.ok) throw Error(r?.error || '拡張機能に接続できません。ページを再読み込みしてください。');
    return r.data;
  };
  function mountStyle() {
    if (!style.isConnected && document.documentElement) document.documentElement.append(style);
    // USER-origin !important also beats inline !important without changing site-owned styles.
    if(!userStyle) userStyle=send({type:'STYLE',marker}).catch(()=>{userStyle=null;});
  }
  function apply() {
    mountStyle();
    const wanted = new Set();
    if (state.enabled && state.site.enabled) {
      for (const rule of state.site.rules) {
        if (!rule.enabled) continue;
        const el = QE.resolve(rule.selector);
        if (el) wanted.add(el);
      }
    }
    if (preview?.isConnected) wanted.add(preview);
    for (const el of hidden) if (!wanted.has(el)) el.removeAttribute(marker);
    for (const el of wanted) if (!el.hasAttribute(marker)) el.setAttribute(marker,'');
    hidden = wanted;
  }
  async function refresh() {
    const current = ++generation;
    try {const next = await send({type:'GET'});if(current === generation){state=next;apply();}}
    catch { // An unloaded/replaced extension must not leave the page hidden indefinitely.
      state = {enabled:false,site:{enabled:false,rules:[]}}; apply();
    }
  }
  const observer = new MutationObserver(records=>{
    if (!records.some(r=>[...r.removedNodes].includes(style) || (r.attributeName !== marker && !picker?.host.contains(r.target) && r.target !== style &&
      !(r.type === 'childList' && [...r.addedNodes,...r.removedNodes].every(n=>n === style || n === picker?.host))))) return;
    if(timer === null) timer=setTimeout(()=>{timer=null;apply();},80);
  });
  observer.observe(document,{subtree:true,childList:true,attributes:true});
  function message(text) {if(picker) picker.note.textContent=text;}
  function ownEvent(e) { return picker && e.composedPath().includes(picker.panel); }
  function targetAt(e){
    const point=e.touches?.[0]||e.changedTouches?.[0]||e;
    if(!Number.isFinite(point.clientX)||!Number.isFinite(point.clientY))return null;
    // A transparent input surface also catches iframe clicks. Hit-test behind our own host.
    return document.elementsFromPoint(point.clientX,point.clientY).find(el=>el!==picker?.host&&!el.closest('[data-qe-ui]'))||null;
  }
  function draw() {
    if (!picker || !highlighted?.isConnected || preview) {if(picker)picker.box.hidden=true;return;}
    const r=highlighted.getBoundingClientRect();
    Object.assign(picker.box.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
    picker.box.hidden=false;
  }
  function move(e) {
    if (!picker || preview || busy || ownEvent(e)) return;
    const target=targetAt(e);
    highlighted=QE.safe(target) ? target : null;
    draw();
  }
  function consume(e){e.preventDefault();e.stopImmediatePropagation();}
  function intercept(e) {
    if (!picker || ownEvent(e))return;
    consume(e);
    if(e.type !== 'click' || preview || busy)return;
    const target=targetAt(e);
    candidate=QE.selector(target);
    if(!candidate){message('この要素は選べません。ページ全体・主要領域・大きすぎる要素・Shadow DOM内部は保護されています。');return;}
    preview=target; highlighted=null; apply(); draw();
    picker.code.textContent=candidate.selector;
    picker.save.disabled=false;picker.again.disabled=false;
    picker.risk.hidden=!candidate.fragile;
    message('1要素をプレビュー非表示中。表示を確認してから保存してください。');
    picker.save.focus();
  }
  function key(e) {
    if(e.key === 'Escape'){consume(e);if(!busy)close();return;}
    if(e.key === 'Tab' && e.type === 'keydown' && picker){
      const buttons=[...picker.host.shadowRoot.querySelectorAll('button:not(:disabled)')];
      if(buttons.length){const index=buttons.indexOf(picker.host.shadowRoot.activeElement);buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}
      consume(e);return;
    }
    // Page keyboard shortcuts and form activation are suppressed during picking.
    if (!ownEvent(e)) consume(e);
  }
  function close() {
    if(!picker)return;
    preview=null;candidate=null;highlighted=null;apply();
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','auxclick','contextmenu','touchstart','touchend']) window.removeEventListener(type,intercept,true);
    window.removeEventListener('pointermove',move,true);
    window.removeEventListener('keydown',key,true);
    window.removeEventListener('keyup',key,true);
    window.removeEventListener('scroll',draw,true);
    window.removeEventListener('resize',draw,true);
    const focus=picker.focus;
    picker.host.remove();picker=null;
    if(focus?.isConnected)focus.focus({preventScroll:true});
  }
  function resetPreview() {
    preview=null;candidate=null;apply();
    picker.save.disabled=true;picker.again.disabled=true;picker.risk.hidden=true;picker.code.textContent='未選択';
    message('要素にマウスを合わせてクリック。Escで終了。');
  }
  function start() {
    if(picker){message('選択モードはすでに起動しています。Escで終了できます。');return {started:true,reused:true};}
    if(!document.documentElement)throw Error('ページの読み込み完了後にもう一度お試しください。');
    const host=document.createElement('div');host.setAttribute('data-qe-ui','');
    host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important';
    const shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML=`<style>
      :host{font:14px/1.5 system-ui,sans-serif;color:#172438;color-scheme:light}
      *{box-sizing:border-box} [hidden]{display:none!important}
      #surface{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;background:transparent}
      #box{position:fixed;border:3px solid #007a72;background:#10b8a42a;pointer-events:none;transition:none}
      section{pointer-events:auto;position:fixed;bottom:18px;right:18px;width:420px;max-width:calc(100vw - 36px);max-height:80vh;overflow:auto;background:#fff;border:1px solid #c7d7da;border-radius:16px;padding:18px;box-shadow:0 8px 40px #14283a44}
      h2{font-size:18px;margin:0 0 8px}p{margin:8px 0}code{display:block;max-height:90px;overflow:auto;overflow-wrap:anywhere;background:#edf3f6;padding:8px;border-radius:6px}
      button{border:1px solid #b3c7cd;border-radius:8px;padding:9px 12px;background:#fff;color:#172438;cursor:pointer;font:inherit;margin:8px 4px 0 0}button:focus-visible{outline:3px solid #009e91}button:disabled{opacity:.4;cursor:default}#save{background:#006d65;color:white}#risk{color:#8a4200;background:#fff4dd;padding:8px}
    </style><div id="surface"></div><div id="box" hidden></div><section role="dialog" aria-label="要素を非表示にする" aria-modal="true">
      <h2>Quiet Element</h2><p id="note" role="status">要素にマウスを合わせてクリック。Escで終了。</p>
      <code id="code">未選択</code><p id="risk" hidden>位置に依存するルールです。サイトの並び順が変わると別の要素に一致する可能性があります。</p>
      <p>保存しても、再訪問時の自動適用には拡張メニューでこのサイトへのアクセス許可が必要です。</p>
      <button id="save" disabled>確定して保存</button><button id="again" disabled>選び直す</button><button id="cancel">キャンセル</button>
    </section>`;
    const get=id=>shadow.getElementById(id);
    picker={host,panel:shadow.querySelector('section'),box:get('box'),note:get('note'),code:get('code'),risk:get('risk'),save:get('save'),again:get('again'),focus:document.activeElement};
    document.documentElement.append(host);
    get('cancel').onclick=()=>{if(!busy)close();};
    get('again').onclick=resetPreview;
    get('save').onclick=async()=>{
      if(busy || !candidate)return;
      if(QE.resolve(candidate.selector)!==preview){message('ページが変化しました。選び直してください。');resetPreview();return;}
      busy=true;get('save').disabled=true;get('cancel').disabled=true;get('again').disabled=true;
      try {
        const result=await send({type:'SAVE',...candidate});
        await refresh();
        busy=false;close();
        // No alert on success: the popup retains the rule and permission status.
        if(result.warning) console.warn('Quiet Element:',result.warning);
      } catch(e) {
        busy=false;resetPreview();get('cancel').disabled=false;
        message('保存できませんでした。プレビューを戻しました。'+e.message);
      }
    };
    for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','auxclick','contextmenu','touchstart','touchend']) window.addEventListener(type,intercept,{capture:true,passive:false});
    window.addEventListener('pointermove',move,true);
    window.addEventListener('keydown',key,true);window.addEventListener('keyup',key,true);
    window.addEventListener('scroll',draw,true);window.addEventListener('resize',draw,true);
    get('cancel').focus();
    return {started:true};
  }
  function onMessage(msg,_sender,reply){
    if(msg.type==='START'){try{reply({ok:true,data:start()});}catch(e){reply({ok:false,error:e.message});}}
    if(msg.type==='REFRESH'){refresh();reply({ok:true});}
  }
  const onStorage=(_changes,area)=>{if(area==='local')refresh();};
  const onPageHide=()=>{busy=false;close();};
  function dispose(){
    busy=false;close();observer.disconnect();clearTimeout(timer);
    for(const el of hidden)el.removeAttribute(marker);hidden.clear();style.remove();
    chrome.runtime.onMessage.removeListener(onMessage);chrome.storage.onChanged.removeListener(onStorage);window.removeEventListener('pagehide',onPageHide);
  }
  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorage);
  window.addEventListener('pagehide',onPageHide);
  // Publish readiness only after initialization succeeds; failed injections remain retryable.
  globalThis.__quietElementController={version,start,dispose};
  refresh();
})();
