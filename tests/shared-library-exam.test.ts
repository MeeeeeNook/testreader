import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
import JSZip from 'jszip';
import {prepareImport,switchImportSkill,disposeImport} from '../src/services/importPreview';
import {ImportPreview} from '../src/components/ImportPreview';
import {listeningDocument,exportReadingDocument} from '../src/services/documentExport';
import {reconcileLibrary,folderOptions} from '../src/services/folders';
import {HomeView} from '../src/components/HomeView';
import {TestCover} from '../src/components/TestCover';
import {ListeningAudio} from '../src/components/ListeningAudio';
import {markFullExam} from '../server/fullExam';
import {fullExamLink,readFullExamDraft,fullExamStorageKey} from '../src/services/fullExam';
const dom=()=>{const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});Object.assign(window.HTMLElement.prototype,{scrollLeft:0,scrollTop:0});return window};
const candidate=(id:string,skill='reading')=>({name:id+'.json',test:{id,skill,title:id,schemaVersion:1,source:'Cambridge',duration:40,status:'published',createdAt:1,updatedAt:1,parts:[{id:'p1',title:'Part 1',passageHtml:'<p>TRANSCRIPT CONTENT</p>',questionHtml:'<p>QUESTION CONTENT</p>',questions:[{number:1,answer:'ANSWER CONTENT',explanationHtml:'<p>EXPLANATION CONTENT</p>'}],slots:{}}]}} as any);

test('switching a wrong-skill ZIP reuses loaded audio and keeps unrelated parser errors',async()=>{
 dom();const zip=new JSZip();zip.file('listen.html','<script>const is_exam_listening=true;const parts='+JSON.stringify([{topic_content:'Transcript',question_content:'<span class="question fill_blank" question-number="1"></span>',questions:[1]}])+';</script>');zip.file('part1.mp3',new Uint8Array([1,2,3]));
 const plan=await prepareImport([new File([new Uint8Array(await zip.generateAsync({type:'uint8array'})).buffer],'Listening.zip'),new File(['{'],'broken.json')],'reading');
 try{assert.equal(plan.candidates.length,0);assert.equal(plan.mismatchedCandidates?.length,1);assert.ok(plan.mismatchedCandidates![0].test.contentHash);const next=switchImportSkill(plan);assert.equal(next.skill,'listening');assert.equal(next.recordings,plan.recordings);assert.equal(next.images,plan.images);assert.equal(next.candidates[0].test.skill,'listening');assert.match(next.errors.join(' '),/broken.json/);assert.doesNotMatch(next.errors.join(' '),/Use Upload Listening/)}finally{disposeImport(plan)}
});

test('wrong-skill prompt can keep current tests and opens the preview dialog afterward',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!);const plan:any={skill:'reading',candidates:[candidate('Reading')],mismatchedCandidates:[candidate('Listening','listening')],images:[],errors:[]};
 try{await act(async()=>root.render(React.createElement(ImportPreview,{plan,onCancel:()=>{},onConfirm:()=>{},onSwitchSkill:()=>{}})));assert.match(document.body.textContent!,/Switch to Listening/);assert.equal(document.querySelector('.import-preview'),null);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Keep Reading tests')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.ok(document.querySelector('.import-preview[open]'));assert.ok(document.querySelector('section[aria-label="Batch destination"]'));assert.equal(document.querySelector('details.import-batch-settings'),null)}finally{await act(async()=>root.unmount())}
});

test('legacy duplicate folders become one shared destination and keep aliases and public menu links',()=>{
 const folders:any=[{id:'r',name:'Cambridge',parentId:null,createdAt:1,skill:'reading'},{id:'l',name:'Cambridge',parentId:null,createdAt:2,skill:'listening'},{id:'rc',name:'Cam 16',parentId:'r',createdAt:1},{id:'lc',name:'Cam 16',parentId:'l',createdAt:2}];
 const tests:any=['reading','listening'].map((skill,i)=>({id:skill,skill,status:'published',folderId:i?'lc':'rc',folderPath:'Cambridge / Cam 16',fullTestMenuFolders:[{id:i?'lc':'rc',path:'Cambridge / Cam 16'}]}));
 const shared=reconcileLibrary(folders,tests);assert.equal(folderOptions(shared.folders).length,2);assert.deepEqual(shared.tests.map(t=>t.folderId),['rc','rc']);assert.deepEqual(shared.tests.map(t=>t.fullTestMenuFolders[0].id),['rc','rc']);assert.ok(shared.folders.find(f=>f.id==='rc')?.aliases?.includes('lc'));
 const guest=reconcileLibrary([],shared.tests);assert.ok(guest.folders.find(f=>f.id==='rc')?.aliases?.includes('lc'));
});

test('Listening document groups questions, answers, explanations, transcripts in order with page breaks',async()=>{
 dom();const test=candidate('Worksheet','listening').test;const blocks=listeningDocument(test,{includeQuestions:true,includeAnswers:true,includeExplanations:true,includeTranscript:true});const headings=blocks.filter((b:any)=>b.kind==='text'&&['Questions','Answer key','Explanations','Transcript'].includes(b.text)) as any[];assert.deepEqual(headings.map(b=>b.text),['Questions','Answer key','Explanations','Transcript']);assert.ok(headings.slice(1).every(b=>b.pageBreakBefore));
 const content=JSON.stringify(blocks);assert.ok(content.indexOf('QUESTION CONTENT')<content.indexOf('ANSWER CONTENT'));assert.ok(content.indexOf('EXPLANATION CONTENT')<content.indexOf('TRANSCRIPT CONTENT'));
 const blob=await exportReadingDocument(test,'docx',false,{includeAnswers:true,includeExplanations:true,includeTranscript:true});const zip=await JSZip.loadAsync(await blob.arrayBuffer());const xml=await zip.file('word/document.xml')!.async('string');assert.ok(xml.indexOf('QUESTION CONTENT')<xml.indexOf('ANSWER CONTENT'));assert.ok(xml.indexOf('EXPLANATION CONTENT')<xml.indexOf('TRANSCRIPT CONTENT'));assert.ok((xml.match(/pageBreakBefore/g)||[]).length>=3);
});

test('signed-in homepage removes guest hero and Listening uses different default artwork',()=>{
 const props:any={tests:[],attempts:[],profile:{id:'learner',name:'Learner',target:7},onNavigate:()=>{},onUpdateProfile:async()=>{}};const signed=renderToStaticMarkup(React.createElement(HomeView,props));assert.doesNotMatch(signed,/mesh-hero|Every test is free/);assert.match(signed,/Explore the test library/);const guest=renderToStaticMarkup(React.createElement(HomeView,{...props,profile:{...props.profile,id:'guest'}}));assert.match(guest,/mesh-hero/);
 assert.notEqual(renderToStaticMarkup(React.createElement(TestCover,{id:'same',title:'Test',skill:'reading'})),renderToStaticMarkup(React.createElement(TestCover,{id:'same',title:'Test',skill:'listening'})));
});

test('80 percent is original gain and raising to 100 percent amplifies without clamping to native volume',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!);const proto=window.HTMLElement.prototype as any;proto.load=()=>{};proto.pause=()=>{};let plays=0;proto.play=async()=>{plays++};let gain=0,closed=0;class FakeContext{state='running';destination={};createMediaElementSource(){return {connect(){},disconnect(){}}}createGain(){return {gain:{get value(){return gain},set value(v:number){gain=v}},connect(){},disconnect(){}}}close(){closed++;return Promise.resolve()}resume(){return Promise.resolve()}}Object.assign(window,{AudioContext:FakeContext});
 try{await act(async()=>root.render(React.createElement(ListeningAudio,{src:'blob:sample',volume:.8,exam:false})));await act(async()=>document.querySelector('[aria-label="Play recording"]')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(plays,1);assert.equal(gain,1);await act(async()=>root.render(React.createElement(ListeningAudio,{src:'blob:sample',volume:1,exam:false})));assert.equal(gain,1.25);assert.equal((document.querySelector('audio') as any).volume,1)}finally{await act(async()=>root.unmount());assert.equal(closed,1)}
});

const store=()=>({test:async(id:string)=>({id,title:id,status:'published',skill:id}),sections:async(id:string)=>Array.from({length:id==='listening'?4:3},(_,i)=>{const start=id==='listening'?i*10:i===0?0:i===1?14:27,count=id==='listening'?10:i===0?14:13;return {id:'p'+i,index:i,questions:Array.from({length:count},(_,j)=>({number:start+j+1})),slots:Object.fromEntries(Array.from({length:count},(_,j)=>['s'+j,{type:'text',numbers:[start+j+1]}]))}}),keys:async()=>({keys:Object.fromEntries(Array.from({length:40},(_,i)=>[i+1,{answer:'yes'}]))})});
test('full exam grades both complete published skills using server keys and rejects missing or swapped skills',async()=>{
 const responses=Object.fromEntries(Array.from({length:40},(_,i)=>[i+1,'yes']));const request={listening:{testId:'listening',responses},reading:{testId:'reading',responses}};const result=await markFullExam(store(),request);assert.equal(result.listening.result.correct,40);assert.equal(result.reading.result.correct,40);assert.equal(result.listening.band,9);await assert.rejects(markFullExam(store(),{listening:request.listening}),/Both Listening and Reading/);await assert.rejects(markFullExam(store(),{...request,reading:{testId:'listening',responses}}),/complete 40-question reading/);
 const unavailable=store();unavailable.test=async id=>({id,status:'draft',skill:id,title:id});await assert.rejects(markFullExam(unavailable,request),/unavailable/);
});
test('full test links contain only choices and drafts are isolated by account',()=>{
 assert.equal(fullExamLink('l','r'),'/full-exam?listening=l&reading=r');const storage={getItem:(key:string)=>key===fullExamStorageKey('one')?JSON.stringify({version:1,id:'session',stage:'reading',listening:'l',reading:'r'}):null};assert.equal(readFullExamDraft(storage,'one')?.stage,'reading');assert.equal(readFullExamDraft(storage,'two'),null);
});
import {VocabularyView} from '../src/components/VocabularyView';

test('batch folder picker assigns all selected tests in one action and leaves unselected tests untouched',async()=>{
 const window=dom();(window.HTMLElement.prototype as any).getBoundingClientRect=()=>({left:0,right:300,top:10,bottom:40,width:300,height:30});const root=createRoot(document.getElementById('app')!);const confirmed:any[]=[];
 const plan:any={skill:'reading',candidates:[candidate('One'),candidate('Two'),candidate('Three')],images:[],errors:[]};const folders:any=[{id:'cam',name:'Cambridge',parentId:null,createdAt:1,updatedAt:1}];
 try{await act(async()=>root.render(React.createElement(ImportPreview,{plan,folders,onCancel:()=>{},onConfirm:items=>confirmed.push(items)})));
 const input=document.querySelector<HTMLInputElement>('[aria-label="Import Three"]')!;await act(async()=>{input.checked=false;input.dispatchEvent(new window.Event('click',{bubbles:true}))});
 await act(async()=>document.querySelector('[aria-label="Folder for 2 selected tests"]')!.dispatchEvent(new window.Event('click',{bubbles:true})));
 await act(async()=>[...document.querySelectorAll('.folder-destination .folder-tree-name')].find(b=>b.textContent==='Cambridge')!.dispatchEvent(new window.Event('click',{bubbles:true})));
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm import 2 tests')!.dispatchEvent(new window.Event('click',{bubbles:true})));
 assert.deepEqual(confirmed[0].map((c:any)=>[c.test.title,c.test.folderId,c.test.folderPath]),[['One','cam','Cambridge'],['Two','cam','Cambridge']]);assert.equal(plan.candidates[2].test.folderId,undefined);
 }finally{await act(async()=>root.unmount())}
});

test('personal vocabulary folders default to Từ mới and move several words together',async()=>{
 const window=dom();(window.HTMLElement.prototype as any).getBoundingClientRect=()=>({left:0,right:300,top:10,bottom:40,width:300,height:30});const root=createRoot(document.getElementById('app')!);const saves:any[]=[];
 function Notebook(){const [profile,setProfile]=React.useState<any>({id:'student',vocabularyFolders:[{id:'academic',name:'Academic'}]});const [vocabulary,setWords]=React.useState<any[]>([{id:'a',word:'alpha',meaning:'First',example:'First example',exampleSource:'manual',createdAt:1},{id:'b',word:'beta',meaning:'Second',example:'Second example',createdAt:2},{id:'c',word:'gamma',meaning:'Third',example:'Third example',createdAt:3,folderId:'academic'}]);return React.createElement(VocabularyView,{profile,vocabulary,onNotify:()=>{},onArchiveWord:async()=>{},onUpdateProfile:async patch=>setProfile((p:any)=>({...p,...patch})),onSaveWord:async word=>{saves.push(word);setWords(words=>words.map(w=>w.id===word.id?{...w,...word}:w));}})}
 try{await act(async()=>root.render(React.createElement(Notebook)));assert.equal(document.querySelectorAll('.vocabulary-table tbody tr').length,2);assert.equal(document.querySelector('.vocabulary-folders .active')!.textContent,'Từ mới2');
 const all=document.querySelector<HTMLInputElement>('[aria-label="Select all words"]')!;await act(async()=>{all.checked=true;all.dispatchEvent(new window.Event('click',{bubbles:true}))});await act(async()=>document.querySelector('[aria-label="Move vocabulary to folder"]')!.dispatchEvent(new window.Event('click',{bubbles:true})));await act(async()=>[...document.querySelectorAll('[role="option"]')].find(b=>b.textContent==='Academic')!.dispatchEvent(new window.Event('click',{bubbles:true})));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Move words')!.dispatchEvent(new window.Event('click',{bubbles:true})));
 assert.equal(saves.length,2);assert.ok(saves.every(w=>w.folderId==='academic'));assert.equal(document.querySelectorAll('.vocabulary-table tbody tr').length,0);
 await act(async()=>[...document.querySelectorAll('.vocabulary-folders button')].find(b=>b.textContent==='Academic3')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(document.querySelectorAll('.vocabulary-table tbody tr').length,3);assert.match(document.querySelector('.vocabulary-table')!.textContent!,/First example/);
 }finally{await act(async()=>root.unmount())}
});
