/* CommonJS is used only by the dependency-free Node tests. */
(() => {
  const empty = () => ({version:1,enabled:true,sites:{}});
  function hostOf(url) {
    const u = new URL(url);
    if (!['http:','https:'].includes(u.protocol) || u.hostname === 'chromewebstore.google.com' ||
      (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore'))) throw Error('このページでは利用できません。通常のHTTP/HTTPSページを開いてください。');
    return u.hostname;
  }
  function validSelector(s) {
    // Only selectors produced by our generator; no lists, attributes, pseudo tricks or CSS injection.
    if (typeof s !== 'string') return false;
    const plain=s.replace(/\\(?:[0-9a-f]{1,6}\s?|.)/gi,'x');
    return typeof s === 'string' && s.length > 0 && s.length <= 1024 &&
      !/[{},;\r\n\[\]*]/.test(plain) && !/:(?!nth-of-type\([1-9]\d*\))/g.test(plain) &&
      !/^(html|body|head|main|header|footer|nav)$/i.test(s);
  }
  function mutate(state, msg, host) {
    const next = structuredClone(state);
    if (msg.type === 'RESET') return empty();
    if (msg.type === 'GLOBAL') { next.enabled = !!msg.enabled; return next; }
    if (!host || host.length > 253 || /[/*\s]/.test(host)) throw Error('サイト指定が無効です。');
    if (!Object.hasOwn(next.sites,host)) Object.defineProperty(next.sites,host,{value:{enabled:true,rules:[]},enumerable:true,writable:true,configurable:true});
    const site = next.sites[host];
    if (msg.type === 'SAVE') {
      if (!validSelector(msg.selector)) throw Error('安全に保存できないセレクタです。');
      const existing = site.rules.find(r=>r.selector === msg.selector);
      if (existing) {existing.enabled = true;return next;}
      if (site.rules.length >= 200 || Object.values(next.sites).reduce((n,s)=>n+s.rules.length,0) >= 1000) throw Error('保存上限です。不要なルールを削除してください。');
      site.rules.push({id:crypto.randomUUID(),selector:msg.selector,fragile:!!msg.fragile,enabled:true,created:Date.now()});
    } else if (msg.type === 'SITE') site.enabled = !!msg.enabled;
    else if (msg.type === 'TOGGLE' || msg.type === 'DELETE') {
      const rule = site.rules.find(r=>r.id === msg.id);
      if (!rule) throw Error('ルールが見つかりません。画面を更新してください。');
      if (msg.type === 'DELETE') site.rules = site.rules.filter(r=>r.id !== msg.id);
      else rule.enabled = !!msg.enabled;
    } else throw Error('未対応の操作です。');
    if (!site.rules.length) delete next.sites[host];
    return next;
  }
  const api = {empty,hostOf,validSelector,mutate};
  globalThis.QEModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
