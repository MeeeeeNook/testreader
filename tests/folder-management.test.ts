import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {planFolderDeletion} from '../src/services/catalog.ts';
import {FolderManager} from '../src/components/FolderManager.tsx';
import type {TestMeta} from '../src/types.ts';
const meta=(id:string,source:string,extra:Partial<TestMeta>={}):TestMeta=>({id,source,title:'Test '+id,skill:'reading',access:'free',status:'published',duration:60,passages:3,questions:40,updatedAt:1,...extra});
const tests=[meta('a','Forecast / Q3'),meta('b','Forecast / Q3 / Week 1',{status:'draft'}),meta('c','Forecast / Q30'),meta('d','Cambridge',{status:'archived'}),meta('gone','Forecast / Q3',{deletedAt:1})];
test('folder deletion includes descendants and archived tests once, respects folder boundaries and excludes Trash',()=>{
 assert.deepEqual(planFolderDeletion(tests,['Forecast/Q3','Forecast / Q3 / Week 1','Cambridge']),{folders:['Forecast / Q3','Cambridge'],ids:['a','b','d']});
 assert.deepEqual(planFolderDeletion(tests,[' / ']).ids,[]);
});
test('selecting multiple folders requires confirmation and cancellation writes nothing',async()=>{
 const {window}=parseHTML('<html><body><div id="app"></div></body></html>');
 Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const writes:string[][]=[];const root=createRoot(document.getElementById('app')!);
 try {
  await act(async()=>root.render(React.createElement(FolderManager,{tests,value:'',onOpen:()=>{},onDelete:async ids=>{writes.push(ids);}})));
  const toggle=async(name:string)=>{const el=document.querySelector<HTMLInputElement>('input[aria-label="'+name+'"]')!;await act(async()=>{el.checked=true;el.dispatchEvent(new window.Event('click',{bubbles:true}));});};
  await toggle('Select folder Forecast');await toggle('Select folder Cambridge');
  const click=async(label:string)=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent===label)!;assert.ok(el,label);await act(async()=>el.dispatchEvent(new window.Event('click',{bubbles:true})));};
  await click('Delete folders');assert.ok(document.querySelector('dialog[open]'));assert.deepEqual(writes,[]);
  await click('Cancel');assert.deepEqual(writes,[]);assert.equal(document.querySelector('dialog'),null);
  await click('Delete folders');await click('Move 4 tests to Trash');
  assert.deepEqual(writes,[['a','b','c','d']]);
 }finally{await act(async()=>root.unmount());}
});

