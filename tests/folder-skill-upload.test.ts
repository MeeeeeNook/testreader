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
test('shared folder choices allow both skills and consolidate legacy duplicates',()=>{
 const shared=reconcileLibrary(folders,tests);
 assert.equal(shared.folders.filter(f=>f.name==='Forecast').length,1);
 assert.equal(shared.tests[0].folderId,shared.tests[1].folderId);
 assert.deepEqual(foldersForSkill(shared.folders,shared.tests,'reading'),foldersForSkill(shared.folders,shared.tests,'listening'));
 assert.throws(()=>changeFolder([folders[0]],'new','Forecast',null,'listening'),/already exists/);
 assert.ok(shared.folders.find(f=>f.name==='Forecast')?.aliases?.length);
});

test('collection pages default to both skills and retain skill filters in links',async()=>{
 dom();const shared=reconcileLibrary(folders,tests);
 const html=renderToStaticMarkup(React.createElement(PracticeCatalog,{folders:shared.folders,folder:shared.folders[0],tests:shared.tests,profile:{} as any,attempts:[],full:true,location:'/folders/r?view=full',onNavigate:()=>{}}));
 assert.match(html,/All tests/);assert.match(html,/reading-test/);assert.match(html,/listening-test/);
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
test('real MP3 encoder produces economical mono 96 kbps audio with progress',()=>{
 const rate=22050,seconds=2,pcm=Float32Array.from({length:rate*seconds},(_,i)=>.3*Math.sin(2*Math.PI*440*i/rate)),progress:number[]=[];
 const encoded=encodeMonoMp3(pcm,rate,p=>progress.push(p));assert.ok(encoded.length>23000&&encoded.length<27000,encoded.length+' bytes');assert.equal(encoded[0],255);assert.equal(encoded[2]>>4,10,'MPEG-2 Layer III frame declares 96 kbps');assert.equal(progress.at(-1),100);assert.ok(encoded.length<pcm.byteLength/6);
});

test('a stalled save surfaces a copyable timeout instead of waiting forever',async()=>{
 assert.equal(await withImportTimeout(Promise.resolve('saved'),'Save',20),'saved');
 await assert.rejects(withImportTimeout(new Promise(()=>{}),'Saving test',5),(error:any)=>error.code==='import/save-timeout'&&/check the library/.test(error.message));
});
