import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {normalizePassageHeadings} from '../src/services/passageFormatting';
import {toEditable} from '../src/services/importer';
import {TestCoverUpload} from '../src/components/TestCoverUpload';
function dom(){const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});return window}
const paragraph='This is ordinary passage text with details and several complete sentences that explain a topic. '.repeat(5);
const malformed='<h2>Part 1</h2><h4><strong>A real passage title</strong></h4>'+Array.from({length:4},(_,i)=>'<h2><span>'+paragraph+(i===0?'<em>Keep emphasis</em> <strong>Important word</strong> <span data-slot="s1"></span>':'')+'</span></h2>').join('');
test('source exports with paragraph-sized headings become normal prose while titles, emphasis and slots survive',()=>{
 dom();const result=normalizePassageHeadings(malformed),root=document.createElement('div');root.innerHTML=result;
 assert.equal(root.querySelectorAll('h2').length,1);assert.equal(root.querySelectorAll('p').length,4);assert.equal(root.querySelector('h4')?.textContent,'A real passage title');assert.equal(root.querySelector('em')?.textContent,'Keep emphasis');assert.match(root.textContent!,/Important word/);assert.ok(root.querySelector('[data-slot="s1"]'));assert.equal(normalizePassageHeadings(result),result);
 const intentional='<h2>Introduction</h2><p>'+paragraph+'</p><h2>Background</h2><p>'+paragraph+'</p>';assert.equal(normalizePassageHeadings(intentional),intentional);assert.equal(normalizePassageHeadings('<h2>'+paragraph+'</h2>'),'<h2>'+paragraph+'</h2>');
});
test('Reading import repairs prose headings but Listening does not rewrite transcript semantics',()=>{
 dom();const source={title:'Test',parts:[{topic_content:malformed,question_content:'<p>Questions</p>',questions:[]}]};const reading=toEditable(source,{skill:'reading'}),listening=toEditable(source,{skill:'listening'});assert.equal((reading.parts[0].passageHtml.match(/<h2/g)||[]).length,1);assert.ok((listening.parts[0].passageHtml.match(/<h2/g)||[]).length>=5);
});
test('cover paste and drop upload images without triggering general import handlers',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!),files:File[]=[],messages:string[]=[];let bubbled=0;const file=new File(['image'],'cover.png',{type:'image/png'});const props:any={test:{id:'test',title:'Test',skill:'reading'},busy:false,onUpload:async(f:File)=>{files.push(f)},onReset:()=>{},onNotify:(s:string)=>messages.push(s)};
 try{await act(async()=>root.render(React.createElement('div',{onDrop:()=>bubbled++,onPaste:()=>bubbled++},React.createElement(TestCoverUpload,props))));const area=document.querySelector('[aria-label="Test cover upload area"]')!;
 const paste=new window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{files:[file],items:[]}});await act(async()=>area.dispatchEvent(paste));assert.equal(files[0],file);assert.equal(bubbled,0);assert.equal(paste.defaultPrevented,true);
 const drop=new window.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{files:[file],items:[]}});await act(async()=>area.dispatchEvent(drop));assert.equal(files.length,2);assert.equal(bubbled,0);
 await act(async()=>root.render(React.createElement(TestCoverUpload,{...props,busy:true})));await act(async()=>document.querySelector('[aria-label="Test cover upload area"]')!.dispatchEvent(drop));assert.equal(files.length,2);assert.equal(document.querySelectorAll('button[disabled]').length,2);
 }finally{await act(async()=>root.unmount())}
});
test('Paste image button reads a clipboard image and uses the same upload path',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!),files:File[]=[];const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{value:{clipboard:{read:async()=>[{types:['image/png'],getType:async()=>new Blob(['image'],{type:'image/png'})}]}},configurable:true});
 try{await act(async()=>root.render(React.createElement(TestCoverUpload,{test:{id:'test',title:'Test',skill:'listening'} as any,busy:false,onUpload:async file=>{files.push(file)},onReset:()=>{},onNotify:()=>{}})));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Paste image')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(files.length,1);assert.equal(files[0].type,'image/png');assert.match(files[0].name,/pasted-cover/)}finally{await act(async()=>root.unmount());if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete(globalThis as any).navigator}
});
