import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
import {prepareImport,replaceImportAssets,disposeImport} from '../src/services/importPreview.ts';
import {ImportPreview} from '../src/components/ImportPreview.tsx';
import {AdminSidebar} from '../src/components/AdminSidebar.tsx';
import {parseRoute} from '../src/services/browserHistory.js';
import type {ImportCandidate} from '../src/services/importPreview.ts';
test('preparing mixed uploads only parses local tests and preserves errors for review',async()=>{
 const {window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document:window.document,Node:window.Node});
 const payload={title:'Local test',parts:[{topic_content:'<h2>The history of cities</h2><p>A passage.</p>',question_content:'',questions:[]}]};
 const plan=await prepareImport([new File([JSON.stringify(payload)],'good.json'),new File(['{broken'],'bad.json')]);
 assert.equal(plan.candidates.length,1);assert.match(plan.candidates[0].test.parts[0].title,/history of cities/);assert.equal(plan.errors.length,1);assert.match(plan.errors[0],/bad.json/);
 const original=plan.candidates[0].test;original.parts[0].passageHtml='<img src="blob:local">';
 const ready=replaceImportAssets(original,new Map([['blob:local','https://storage.example/image.png']]));
 assert.match(ready.parts[0].passageHtml,/https:\/\/storage.example/);assert.match(original.parts[0].passageHtml,/blob:local/);disposeImport(plan);
});
test('preview does not import on open and confirmation sends only selected tests as published by default',async()=>{
 const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const plan=await prepareImport(['One','Two'].map(title=>new File([JSON.stringify({title,parts:[{topic_content:`<h2>${title} source title</h2>`,question_content:'',questions:[]}]})],title+'.json')));
 const confirmed:ImportCandidate[][]=[];let cancelled=0;
 const root=createRoot(document.getElementById('app')!);
 try{
  await act(async()=>root.render(React.createElement(ImportPreview,{plan,existingIds:new Set([plan.candidates[0].test.id]),onCancel:()=>{cancelled++;},onConfirm:items=>confirmed.push(items)})));
  assert.equal(confirmed.length,0);assert.ok(document.querySelector('dialog[open]'));assert.equal(document.querySelector('iframe'),null);assert.match(document.querySelector('.preview-reading-layout')!.textContent!,/One source title/);
  const checks=[...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  await act(async()=>{checks[1].checked=false;checks[1].dispatchEvent(new window.Event("click",{bubbles:true}));});
  const submit=[...document.querySelectorAll('button')].find(b=>b.textContent?.startsWith('Confirm import'))!;
  await act(async()=>submit.dispatchEvent(new window.Event('click',{bubbles:true})));
  assert.equal(confirmed.length,1);assert.equal(confirmed[0].length,1);assert.equal(confirmed[0][0].test.status,'published');assert.equal(confirmed[0][0].test.id,plan.candidates[0].test.id);
  const cancel=[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel import')!;
  await act(async()=>cancel.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(cancelled,1);
 }finally{await act(async()=>root.unmount());disposeImport(plan);}
});
test('admin sidebar points to separate reloadable pages with active page state',()=>{
 for(const section of ['tests','folders','upload','reports','archive','trash'])assert.deepEqual(parseRoute('/admin/'+section),{name:'admin',section});
 const html=renderToStaticMarkup(React.createElement(AdminSidebar,{location:'/admin/folders',onNavigate:()=>{}}));
 assert.match(html,/href="\/admin\/folders" aria-current="page"/);assert.match(html,/href="\/admin\/upload"/);assert.match(html,/href="\/admin\/students"/);
});

test('one upload batch preserves different destination folders for its tests',async()=>{
 const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const plan=await prepareImport(['One','Two'].map(title=>new File([JSON.stringify({title,parts:[{topic_content:'<p>Passage</p>',question_content:'',questions:[]}]})],title+'.json')));
 plan.candidates[0].test.folderId='a';plan.candidates[1].test.folderId='b';
 const folders:any=['a','b'].map(id=>({id,name:id.toUpperCase(),parentId:null,skill:'reading',createdAt:1,updatedAt:1}));
 const confirmed:ImportCandidate[][]=[],root=createRoot(document.getElementById('app')!);
 try{await act(async()=>root.render(React.createElement(ImportPreview,{plan,folders,onCancel:()=>{},onConfirm:items=>confirmed.push(items)})));
 assert.ok(document.querySelector('[aria-label="Destination for this test"]'));assert.equal(confirmed.length,0);
 const submit=[...document.querySelectorAll('button')].find(b=>b.textContent?.startsWith('Confirm import'))!;await act(async()=>submit.dispatchEvent(new window.Event('click',{bubbles:true})));
 assert.deepEqual(confirmed[0].map(c=>[c.test.folderId,c.test.folderPath]),[['a','A'],['b','B']]);
 }finally{await act(async()=>root.unmount());disposeImport(plan)}
});
test('import opens content by default and switches audio/settings without stacking them above the questions',async()=>{
 const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const plan=await prepareImport([new File([JSON.stringify({title:'Listening sample',parts:[{topic_content:'<p>Transcript</p>',question_content:'<p>Questions</p>',questions:[]}]})],'sample.json')]);plan.candidates[0].test.skill='listening';
 const root=createRoot(document.getElementById('app')!);
 try{await act(async()=>root.render(React.createElement(ImportPreview,{plan,onCancel:()=>{},onConfirm:()=>{}})));
 assert.equal(document.querySelector('.import-content-panel')!.hasAttribute('hidden'),false);assert.equal(document.querySelector('.import-audio-panel')!.hasAttribute('hidden'),true);assert.equal(document.querySelector('.import-settings-panel')!.hasAttribute('hidden'),true);assert.equal(document.querySelector('.import-batch-settings')!.hasAttribute('open'),false);
 const buttons=[...document.querySelectorAll('.import-panel-tabs button')];await act(async()=>buttons[1].dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(document.querySelector('.import-content-panel')!.hasAttribute('hidden'),true);assert.equal(document.querySelector('.import-audio-panel')!.hasAttribute('hidden'),false);
 await act(async()=>buttons[2].dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(document.querySelector('.import-settings-panel')!.hasAttribute('hidden'),false);assert.equal(document.querySelector('.import-audio-panel')!.hasAttribute('hidden'),true);
 }finally{await act(async()=>root.unmount());disposeImport(plan)}
});
