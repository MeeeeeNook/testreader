import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
function environment(){const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{pretendToBeVisual:true,url:'https://reading.local/'});const w=dom.window;for(const [key,value]of Object.entries({window:w,document:w.document,Node:w.Node,HTMLElement:w.HTMLElement,HTMLInputElement:w.HTMLInputElement,MutationObserver:w.MutationObserver,DOMParser:w.DOMParser,getComputedStyle:w.getComputedStyle.bind(w),requestAnimationFrame:w.requestAnimationFrame.bind(w),cancelAnimationFrame:w.cancelAnimationFrame.bind(w),innerHeight:900,innerWidth:1200,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});w.HTMLElement.prototype.scrollIntoView=()=>{};w.Range.prototype.getClientRects=()=>[];w.Range.prototype.getBoundingClientRect=()=>({top:0,left:0,right:0,bottom:0,width:0,height:0});return dom;}
test('the actual test editor mounts both rich editors for an imported Listening test',async()=>{
 const dom=environment();const {TestEditorView}=await import('../src/components/TestEditorView');
 const root=createRoot(document.getElementById('root')!);const test:any={id:'sample',schemaVersion:1,title:'Listening test',skill:'listening',source:'Cambridge',access:'free',status:'published',duration:40,createdAt:1,updatedAt:1,parts:[{id:'p1',title:'Part 1',passageHtml:'<p>Transcript</p>',questionHtml:'<p>Questions 1–10 <span data-slot="s1"></span></p>',slots:{s1:{id:'s1',numbers:[1],type:'text',label:'',options:[]}},questions:[{number:1,kind:'fill_blank',answer:'sample'}]}]};
 try{await act(async()=>root.render(React.createElement(TestEditorView,{test,onSave:async()=>{},onPreview:()=>{},onClose:()=>{},onNotify:()=>{}})));await act(async()=>new Promise(r=>setTimeout(r,50)));assert.equal(document.querySelectorAll('.document-editor').length,2);assert.match(document.body.textContent!,/Test Editor/);assert.equal(document.querySelector<HTMLInputElement>('input[placeholder="e.g. Cambridge Reading Test 1"]')?.value||document.querySelector<HTMLInputElement>('.studio-field input')?.value,'Listening test')}finally{await act(async()=>root.unmount());dom.window.close()}
});
import {loadWithRecovery} from '../src/services/moduleRecovery';
import {EditorErrorBoundary} from '../src/components/EditorErrorBoundary';

test('an outdated editor chunk reloads once, preserves the error if retry fails, and clears recovery after success',async()=>{
 const values=new Map<string,string>();let reloads=0;const browser:any={sessionStorage:{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)},location:{reload:()=>reloads++}};
 const failure=async()=>{throw Error('Failed to fetch dynamically imported module: /assets/TestEditor-old.js')};await assert.rejects(loadWithRecovery(failure,'editor',browser));assert.equal(reloads,1);await assert.rejects(loadWithRecovery(failure,'editor',browser));assert.equal(reloads,1);assert.equal(await loadWithRecovery(async()=>'ready','editor',browser),'ready');assert.equal(values.size,0);
 await assert.rejects(loadWithRecovery(async()=>{throw Error('Invalid test data')},'editor',browser));assert.equal(reloads,1);
});
test('a rendering error shows the exact test and diagnostic instead of a blank page',async()=>{
 const dom=environment(),root=createRoot(document.getElementById('root')!);const previous=console.error;console.error=()=>{};
 function Broken():React.ReactNode{throw Error('Question controls could not initialize')}
 try{await act(async()=>root.render(React.createElement(EditorErrorBoundary,{testId:'vol9-test5',title:'Vol 9 Test 5',onBack:()=>{},children:React.createElement(Broken)})));assert.match(document.body.textContent!,/Could not open this editor/);assert.match(document.body.textContent!,/Vol 9 Test 5/);assert.match(document.body.textContent!,/vol9-test5/);assert.match(document.body.textContent!,/Question controls could not initialize/);assert.ok(document.querySelector('[role="alert"]'))}finally{await act(async()=>root.unmount());dom.window.close();console.error=previous}
});
