/* Shared picker safety policy. No page text or URLs are collected. */
(() => {
  const version='1.1.0';
  if (globalThis.QE?.version === version) return;
  // getRandomValues works in HTTP content scripts; randomUUID is secure-context only.
  function token(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
  const forbidden = 'html,body,head,main,header,footer,nav,script,style,link,meta,title,base,[role="main"],[role="navigation"],[data-qe-ui]';
  function safe(el) {
    if (!(el instanceof Element) || el.ownerDocument !== document || el.getRootNode() !== document ||
      el.matches(forbidden) || el.closest('[data-qe-ui]')) return false;
    const r=el.getBoundingClientRect();
    return !(r.width >= innerWidth * .9 && r.height >= innerHeight * .8);
  }
  function resolve(selector) {
    try {
      if (typeof selector !== 'string' || !selector || selector.length > 1024) return null;
      const found = document.querySelectorAll(selector);
      return found.length === 1 && safe(found[0]) ? found[0] : null;
    } catch { return null; }
  }
  function stable(token) {
    return token.length > 1 && token.length < 64 && !/\d{3}|[a-f0-9]{8}|^(css-|jsx-|sc-)/i.test(token);
  }
  function selector(el) {
    if (!safe(el)) return null;
    const escape = CSS.escape;
    const unique = s => resolve(s) === el;
    if (el.id && stable(el.id)) {
      const s = '#' + escape(el.id);
      if (unique(s)) return {selector:s, fragile:false};
    }
    let parts = [], fragile = false, node = el;
    for (let depth = 0; node && node !== document.body && depth < 7; depth++, node = node.parentElement) {
      let part = node.localName;
      if (node.id && stable(node.id) && document.querySelectorAll('#' + escape(node.id)).length === 1) {
        part = '#' + escape(node.id);
      } else {
        const classes = [...node.classList].filter(stable).sort().slice(0,3);
        if (classes.length) part += classes.map(c => '.' + escape(c)).join('');
        const peers = node.parentElement ? [...node.parentElement.children].filter(n => n.matches(part)) : [];
        if (peers.length > 1) {
          const sameTag = [...node.parentElement.children].filter(n => n.localName === node.localName);
          part += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
          fragile = true;
        }
      }
      parts.unshift(part);
      const candidate = parts.join(' > ');
      if (unique(candidate)) return {selector:candidate, fragile};
    }
    return null;
  }
  globalThis.QE = Object.freeze({version,token,safe,resolve,selector});
})();
