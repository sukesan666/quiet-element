const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../extension/model.js');
test('reject restricted pages, schemes, and store',()=>{
 for(const url of ['chrome://settings','file:///test','https://chromewebstore.google.com/detail/x','https://chrome.google.com/webstore/x']) assert.throws(()=>M.hostOf(url));
 assert.equal(M.hostOf('https://sub.example.com:8080/path'),'sub.example.com');
});
test('deduplicates, toggles, deletes and resets',()=>{
 let s=M.mutate(M.empty(),{type:'SAVE',selector:'#ad'},'example.com');
 s=M.mutate(s,{type:'SAVE',selector:'#ad'},'example.com');assert.equal(s.sites['example.com'].rules.length,1);
 const id=s.sites['example.com'].rules[0].id;
 s=M.mutate(s,{type:'TOGGLE',id,enabled:false},'example.com');assert.equal(s.sites['example.com'].rules[0].enabled,false);
 s=M.mutate(s,{type:'SITE',enabled:false},'example.com');assert.equal(s.sites['example.com'].enabled,false);
 s=M.mutate(s,{type:'GLOBAL',enabled:false});assert.equal(s.enabled,false);
 assert.deepEqual(M.mutate(s,{type:'RESET'}),{version:1,enabled:true,sites:{}});
 s=M.mutate(s,{type:'DELETE',id},'example.com');assert.equal(Object.keys(s.sites).length,0);
});
test('selector injection and unknown actions are rejected',()=>{
 for(const selector of ['body','*','div, body','x{display:none}','div:has(main)','[id="ad"]']) assert.throws(()=>M.mutate(M.empty(),{type:'SAVE',selector},'example.com'));
 assert.throws(()=>M.mutate(M.empty(),{type:'WRONG'},'example.com'));
 assert.equal(M.validSelector('#ad\\:slot'),true);
});
test('host keys cannot read or mutate Object prototype',()=>{
 const s=M.mutate(M.empty(),{type:'SAVE',selector:'#ad'},'__proto__');
 assert.equal(Object.hasOwn(s.sites,'__proto__'),true);
 assert.equal(s.sites.__proto__.rules.length,1);
 assert.equal(Object.prototype.rules,undefined);
});
test('site rule limit rejects next insertion without modifying input',()=>{
 const s=M.empty();s.sites['example.com']={enabled:true,rules:Array.from({length:200},(_,n)=>({id:String(n),selector:'#ad'+n,enabled:true}))};
 assert.throws(()=>M.mutate(s,{type:'SAVE',selector:'#more'},'example.com'));
 assert.equal(s.sites['example.com'].rules.length,200);
});
test('escaped CSS punctuation in a generated ID can be saved safely',()=>{
 for(const selector of ['#ad\\,slot','#ad\\{slot\\}','#ad\\[slot\\]']) assert.equal(M.validSelector(selector),true);
 for(const selector of ['#ad,body','#ad{display:none}','#ad[slot]']) assert.equal(M.validSelector(selector),false);
});
