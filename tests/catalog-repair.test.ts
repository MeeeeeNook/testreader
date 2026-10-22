import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {PracticeCatalog} from '../src/components/PracticeCatalog.tsx';
import type {TestMeta,UserProfile} from '../src/types.ts';
test('legacy practice cards recover all titles when section requests finish out of order without repeated reads',async()=>{
 const {window}=parseHTML('<html><body><div id="app"></div></body></html>');
 Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const profile:UserProfile={id:'guest',name:'Learner',email:'',target:7,language:'vi',theme:'light',fontSize:18,favorites:[],status:'active'};
 const tests:TestMeta[]=['a','b'].map(id=>({id,title:'Test '+id,source:'Forecast',skill:'reading',access:'free',status:'published',duration:20,passages:1,questions:13,updatedAt:1}));
 const pending:Record<string,(value:Partial<TestMeta>)=>void>={};let calls=0;
 const loadSummary=(t:TestMeta)=>{calls++;return new Promise<Partial<TestMeta>>(resolve=>{pending[t.id]=resolve;});};
 const props={tests,profile,attempts:[],location:'/practice',onNavigate:()=>{},loadSummary};
 const root=createRoot(document.getElementById('app')!);
 try {
  await act(async()=>root.render(React.createElement(PracticeCatalog,props)));
  assert.equal(calls,2);
  await act(async()=>pending.b({sectionSummaries:[{id:'p0',index:1,title:'Australian birds',questions:13,kinds:[]}]}));
  await act(async()=>pending.a({sectionSummaries:[{id:'p0',index:0,title:'Airborne Dentists',questions:13,kinds:[]}]}));
  const headings=[...document.querySelectorAll('.practice-card h2')].map(el=>el.textContent);
  assert.deepEqual(headings,['Airborne Dentists','Australian birds']);
  assert.match(document.body.textContent||'',/PASSAGE 2/);
  await act(async()=>root.render(React.createElement(PracticeCatalog,{...props,location:'/practice?q=birds'})));
  assert.equal(calls,2);assert.equal(document.querySelectorAll('.practice-card').length,1);
 } finally {await act(async()=>root.unmount());}
});
