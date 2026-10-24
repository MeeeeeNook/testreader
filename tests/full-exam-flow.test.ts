import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
test('shared full exam loads missing catalog tests, works for guests and signs in without losing the selected IDs',async()=>{
 const temp=mkdtempSync(resolve('node_modules/.cache/full-exam-')),output=join(temp,'exam.cjs');
 (globalThis as any).__fullExamUser=null;(globalThis as any).__fullExamCalls=[];(globalThis as any).__fullExamHistory=[];(globalThis as any).__failGrade=true;
 await build({entryPoints:['src/components/FullExamView.tsx'],outfile:output,bundle:true,platform:'node',format:'cjs',packages:'external',external:['react'],plugins:[{name:'exam-boundaries',setup(b){
 b.onResolve({filter:/services\/firestoreAdapter$/},()=>({path:'store',namespace:'stub'}));
 b.onResolve({filter:/\/firebase$/},()=>({path:'auth',namespace:'stub'}));
 b.onResolve({filter:/services\/apiRequest$/},()=>({path:'api',namespace:'stub'}));
 b.onResolve({filter:/services\/localHistory.js$/},()=>({path:'history',namespace:'stub'}));
 b.onResolve({filter:/\.\/TestWorkspace$/},()=>({path:'workspace',namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='store'?`export const firestoreAdapter={get:async(_kind,id)=>({id,title:id,skill:id,status:'published',questions:40,passages:id==='listening'?4:3}),getTestComplete:async id=>({id,title:id,skill:id,status:'published',updatedAt:1,parts:Array.from({length:id==='listening'?4:3},(_,i)=>({id:'p'+i,questions:Array.from({length:id==='listening'?10:i===0?14:13},(_,j)=>({number:j+1})),slots:{},passageHtml:'',questionHtml:''}))})}`:args.path==='auth'?`export const auth={get currentUser(){return globalThis.__fullExamUser}}`:args.path==='api'?`export async function requestJson(url,payload){globalThis.__fullExamCalls.push({url,payload});if(globalThis.__failGrade){globalThis.__failGrade=false;throw Error('Temporary grading failure')}return {listening:{result:{correct:30,total:40,rows:[]},band:7},reading:{result:{correct:35,total:40,rows:[]},band:8}}}`:args.path==='history'?`export function saveAttempt(storage,owner,attempt){globalThis.__fullExamHistory.push({owner,attempt})}`:`const React=require('react');export function TestWorkspace(props){return React.createElement('button',{'data-stage':props.test.skill,onClick:()=>props.onStageComplete({responses:{1:'sample'},startedAt:10,completedAt:20,elapsedSeconds:10}).catch(e=>props.onNotify(e.message))},'Finish '+props.test.skill)}` }));
 }}]});
 const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});window.scrollTo=()=>{};const values=new Map();Object.assign(globalThis,{localStorage:{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v)}});
 const {FullExamView}=createRequire(import.meta.url)(output),root=createRoot(document.getElementById('app')!),notices:string[]=[];
 const props:any={tests:[],profile:{id:'guest'},location:'/full-exam?listening=listening&reading=reading',onNavigate:()=>{},onNotify:(s:string)=>notices.push(s),onSaveVocabulary:async()=>{},onHistorySaved:()=>{}};
 const click=async(text:string)=>act(async()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);assert.ok(b,text);b.dispatchEvent(new window.Event('click',{bubbles:true}));});
 try{
 await act(async()=>root.render(React.createElement(FullExamView,props)));assert.doesNotMatch(document.body.textContent!,/Sign in to continue/);
 await click('Start full test');assert.equal(document.querySelector('[data-stage]')?.getAttribute('data-stage'),'listening');
 await click('Finish listening');assert.equal((globalThis as any).__fullExamCalls.length,0);assert.match(document.body.textContent!,/Listening complete/);assert.equal(JSON.parse([...values.values()][0]).stage,'reading');
 await click('Start Reading');await click('Finish reading');assert.equal(notices.at(-1),'Temporary grading failure');assert.equal((globalThis as any).__fullExamHistory.length,0);assert.equal(document.querySelector('[data-stage]')?.getAttribute('data-stage'),'reading');
 await click('Finish reading');assert.match(document.body.textContent!,/Two skills/);assert.match(document.body.textContent!,/30 \/ 40/);assert.match(document.body.textContent!,/35 \/ 40/);assert.equal((globalThis as any).__fullExamHistory.length,0,'guest grades are not written into account history');
 (globalThis as any).__fullExamUser={uid:'learner'};
 await act(async()=>root.render(React.createElement(FullExamView,{...props,key:'learner',profile:{id:'learner'}})));
 await click('Start full test');await click('Finish listening');await click('Start Reading');await click('Finish reading');
 assert.equal((globalThis as any).__fullExamHistory.length,2);assert.equal((globalThis as any).__fullExamHistory[0].owner,'learner');assert.equal((globalThis as any).__fullExamHistory[0].attempt.fullExamId,(globalThis as any).__fullExamHistory[1].attempt.fullExamId);
 }finally{await act(async()=>root.unmount());rmSync(temp,{recursive:true,force:true});delete(globalThis as any).__fullExamUser;delete(globalThis as any).__fullExamCalls;delete(globalThis as any).__fullExamHistory;delete(globalThis as any).__failGrade;}
});
