import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {PracticeCatalog} from '../src/components/PracticeCatalog';
import {FolderPage} from '../src/components/FolderPage';
import {parseRoute} from '../src/services/browserHistory.js';
const environment=()=>{const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});window.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,right:300,top:10,bottom:40,width:300,height:30} as any);return window;};
const folders:any=[{id:'cam',name:'Cambridge',parentId:null},{id:'cam16',name:'Cam 16',parentId:'cam'},{id:'test1',name:'Test 1',parentId:'cam16'},{id:'forecast',name:'Forecast',parentId:null}];
const tests:any=['reading','listening'].map(skill=>({id:skill,title:skill+' test',skill,status:'published',source:'Cambridge / Cam 16',folderId:'cam16',folderPath:'Cambridge / Cam 16',passages:skill==='reading'?3:4,questions:40,duration:40,updatedAt:1,sectionSummaries:Array.from({length:skill==='reading'?3:4},(_,index)=>({id:'p'+index,index,title:skill==='reading'?'Named passage '+index:'Part '+(index+1),questions:10,kinds:[index===0?'multiple_choice':'matching_features']}))}));
const profile:any={id:'guest'};
test('catalog folders occupy a top row, reveal one level at a time and preserve skill and full-test view',async()=>{
 const window=environment(),root=createRoot(document.getElementById('app')!);let location='';
 function Catalog(){const [path,setPath]=React.useState('/full-tests?skill=listening');location=path;const route=parseRoute(path),props={folders,tests,profile,attempts:[],location:path,onNavigate:setPath};return route.name==='folder'?React.createElement(FolderPage,{...props,id:route.id!}):React.createElement(PracticeCatalog,{...props,full:true});}
 const click=async(selector:string,label:string)=>act(async()=>[...document.querySelectorAll(selector)].find(node=>node.textContent===label)!.dispatchEvent(Object.assign(new window.Event('click',{bubbles:true,cancelable:true}),{button:0})));
 try{await act(async()=>root.render(React.createElement(Catalog)));const names=()=>[...document.querySelectorAll('.catalog-folder-link')].map(node=>node.textContent);
 assert.deepEqual(names(),['Cambridge','Forecast']);assert.equal(document.querySelector('.catalog-filter-panel .folder-tree'),null);assert.equal(document.querySelector('.mini-skill-tabs'),null);
 assert.ok([...document.querySelector('.practice-page')!.children].indexOf(document.querySelector('.catalog-folders')!)<[...document.querySelector('.practice-page')!.children].indexOf(document.querySelector('.catalog-layout')!));
 await click('.catalog-folder-link','Cambridge');assert.deepEqual(names(),['Cam 16']);assert.equal(new URL(location,'https://test.local').searchParams.get('skill'),'listening');assert.equal(new URL(location,'https://test.local').searchParams.get('view'),'full');
 await click('.catalog-folder-link','Cam 16');assert.deepEqual(names(),['Test 1']);assert.equal(document.querySelectorAll('.practice-card').length,1);
 await click('.collection-breadcrumbs a','All folders');assert.deepEqual(names(),['Cambridge','Forecast']);assert.match(location,/^\/full-tests\?skill=listening/);
 }finally{await act(async()=>root.unmount());}
});
test('Mini Test defaults to Reading, restores passage/type filters and switches to four Listening parts',async()=>{
 const window=environment(),root=createRoot(document.getElementById('app')!);let location='';
 function Catalog(){const [path,setPath]=React.useState('/practice');location=path;return React.createElement(PracticeCatalog,{tests,folders,profile,attempts:[],location:path,onNavigate:setPath});}
 const click=async(selector:string)=>act(async()=>document.querySelector(selector)!.dispatchEvent(new window.Event('click',{bubbles:true})));
 try{await act(async()=>root.render(React.createElement(Catalog)));assert.equal(document.querySelectorAll('.mini-skill-tabs button').length,2);assert.match(document.querySelector('.mini-skill-tabs [aria-pressed="true"]')!.textContent!,/Reading/);assert.match(document.querySelector('.catalog-filter-panel')!.textContent!,/Passage|Question type/);assert.equal(document.querySelectorAll('.practice-card').length,3);
 await click('[aria-label="Passage or section"]');assert.ok([...document.querySelectorAll('[role="option"]')].some(option=>option.textContent==='Passage 3'));assert.ok(![...document.querySelectorAll('[role="option"]')].some(option=>option.textContent==='Part 4'));
 await click('[aria-label="Passage or section"]');
 await act(async()=>[...document.querySelectorAll('.mini-skill-tabs button')].find(b=>b.textContent?.includes('Listening'))!.dispatchEvent(new window.Event('click',{bubbles:true})));
 assert.equal(new URL(location,'https://test.local').searchParams.get('skill'),'listening');assert.equal(document.querySelectorAll('.practice-card').length,4);assert.match(document.querySelector('.catalog-filter-panel')!.textContent!,/Part|Question type/);assert.doesNotMatch(document.querySelector('.catalog-filter-panel')!.textContent!,/TRUE|Headings/);
 await click('[aria-label="Passage or section"]');await act(async()=>[...document.querySelectorAll('[role="option"]')].find(option=>option.textContent==='Part 4')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(document.querySelectorAll('.practice-card').length,1);assert.match(document.querySelector('.practice-card')!.textContent!,/PART 4/);
 const matching=[...document.querySelectorAll('.catalog-filter-panel label')].find(node=>node.textContent==='Matching')!.querySelector('input')!;await act(async()=>{(matching as any).checked=true;matching.dispatchEvent(new window.Event('click',{bubbles:true}));});assert.equal(new URL(location,'https://test.local').searchParams.get('types'),'matching_features');assert.equal(document.querySelectorAll('.practice-card').length,1);
 }finally{await act(async()=>root.unmount());}
});
