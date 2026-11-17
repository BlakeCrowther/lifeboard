(function(){const D=window.MOCK;const subs={};
const snap=c=>({docs:Object.entries(D[c]||{}).map(([id,b])=>({id,data:()=>JSON.parse(JSON.stringify(b))}))});
const fire=c=>(subs[c]||[]).forEach(f=>f(snap(c)));
const col=c=>({onSnapshot(f){(subs[c]=subs[c]||[]).push(f);setTimeout(()=>f(snap(c)));return()=>{}},
 doc(id){id=id||'m'+Math.random().toString(36).slice(2);const o=D[c]=D[c]||{};return{id,set:async b=>{o[id]=b;fire(c)},update:async p=>{o[id]={...o[id],...p};fire(c)},delete:async()=>{delete o[id];fire(c)}}}});
window.claude={use:async k=>k==='db'?{collection:col}:null};})();
