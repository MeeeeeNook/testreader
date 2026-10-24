import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
import JSZip from 'jszip';
import {foldersForSkill,folderLink,fullTestMenu,changeFolder,reconcileLibrary} from '../src/services/folders';
import {PracticeCatalog} from '../src/components/PracticeCatalog';
import {AdminView} from '../src/components/AdminView';
import {prepareImport,disposeImport} from '../src/services/importPreview';
import {importError,withImportTimeout} from '../src/services/importProgress';
import {encodeMonoMp3} from '../src/services/mp3Encoder';
const folders:any[]=[{id:'r',name:'Forecast',parentId:null,skill:'reading'},{id:'l',name:'Forecast',parentId:null,skill:'listening'},{id:'lc',name:'Q3',parentId:'l',skill:'listening'}];
const meta=(id:string,skill:'reading'|'listening',folderId:string)=>({id,skill,folderId,folderPath:'Forecast',source:'Forecast',title:id,status:'published',access:'free',updatedAt:1,createdAt:1,duration:30,questions:40,passages:skill==='reading'?3:4,fullTestMenuFolders:[{id:folderId,path:'Forecast'}]} as any);
const tests=[meta('reading-test','reading','r'),meta('listening-test','listening','l')];
function dom(){const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});return window}
test('folders and full-test menus separate skills, retain empty typed folders, and allow matching names',()=>{
 assert.deepEqual(foldersForSkill(folders,tests,'reading').map(f=>f.id),['r']);assert.deepEqual(foldersForSkill(folders,tests,'listening').map(f=>f.id),['l','lc']);
 assert.deepEqual(fullTestMenu(tests,'listening').folders.map(f=>f.id),['l']);assert.equal(folderLink('l','listening'),'/folders/l?skill=listening');
 assert.throws(()=>changeFolder(folders,'new','Forecast',null,'reading'),/already exists/);
 assert.equal(changeFolder([folders[0]],'new','Forecast',null,'listening').length,2);
 assert.equal(reconcileLibrary(folders,[{...meta('legacy','listening','unknown'),fullTestMenuFolders:[]}]).tests[0].folderId,'l');
});

test('Listening folder links preserve the skill and practice view; Reading folders stay hidden',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!),visited:string[]=[];
 try{await act(async()=>root.render(React.createElement(PracticeCatalog,{folders,tests,profile:{} as any,attempts:[],location:'/practice?skill=listening',onNavigate:path=>visited.push(path)})));
 const links=Array.from(document.querySelectorAll('.collection-folders a'));assert.equal(links.length,1);assert.equal(links[0].getAttribute('href'),'/folders/l?skill=listening&view=practice');
 const click=new window.Event('click',{bubbles:true});Object.defineProperty(click,'button',{value:0});await act(async()=>links[0].dispatchEvent(click));assert.equal(visited[0],'/folders/l?skill=listening&view=practice');
 await act(async()=>root.render(React.createElement(PracticeCatalog,{folders,folder:folders[1],tests,profile:{} as any,attempts:[],full:true,location:'/folders/l',onNavigate:()=>{}})));
 assert.match(document.querySelector('.portal-skill-tabs .active')!.textContent!,/Listening/);assert.equal(document.querySelectorAll('.practice-card').length,1);
 }finally{await act(async()=>root.unmount())}
});
test('admin presents explicit Reading and Listening uploads before file selection',()=>{
 const noop=()=>{},props:any={tests:[],folders:[],reports:[],learners:[],adminUid:'admin',section:'upload',onUploadFiles:async()=>{},onOpenUpload:noop,onNewTest:noop};
 const html=renderToStaticMarkup(React.createElement(AdminView,props));assert.match(html,/Upload Reading/);assert.match(html,/Upload Listening/);assert.match(html,/aria-label="Upload skill"/);
});
test('wrong upload mode is reported explicitly; ZIP preparation reports progress through completion',async()=>{
 dom();const zip=new JSZip(); // Use JSON serialization for the original source declaration.
 zip.file('listen.html','<script>const is_exam_listening=true;const parts='+JSON.stringify([{topic_content:'Transcript',question_content:'<span class="question fill_blank" question-number="1"></span>',questions:[1]}])+';</script>');
 const file=new File([new Uint8Array(await zip.generateAsync({type:'uint8array'})).buffer],'sample.zip');const progress:number[]=[];const plan=await prepareImport([file],'reading',p=>progress.push(p.percent));
 try{assert.equal(plan.candidates.length,0);assert.match(plan.errors.join(' '),/Use Upload Listening/);assert.equal(progress.at(-1),100);assert.ok(progress.some(p=>p>0&&p<100))}finally{disposeImport(plan)}
 assert.match(importError({code:'storage/unauthorized',message:'Denied'}),/storage\/unauthorized.*Storage rules/);
});
test('real MP3 encoder produces economical mono 64 kbps audio with progress',()=>{
 const rate=22050,seconds=2,pcm=Float32Array.from({length:rate*seconds},(_,i)=>.3*Math.sin(2*Math.PI*440*i/rate)),progress:number[]=[];
 const encoded=encodeMonoMp3(pcm,rate,p=>progress.push(p));assert.ok(encoded.length>15000&&encoded.length<18000,encoded.length+' bytes');assert.equal(encoded[0],255);assert.equal(encoded[2]>>4,8,'MPEG-2 Layer III frame declares 64 kbps');assert.equal(progress.at(-1),100);assert.ok(encoded.length<pcm.byteLength/10);
});

test('a stalled save surfaces a copyable timeout instead of waiting forever',async()=>{
 assert.equal(await withImportTimeout(Promise.resolve('saved'),'Save',20),'saved');
 await assert.rejects(withImportTimeout(new Promise(()=>{}),'Saving test',5),(error:any)=>error.code==='import/save-timeout'&&/check the library/.test(error.message));
});
