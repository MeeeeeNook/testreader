import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { readAttempts } from '../src/services/localHistory.js';
import { scoreTest, estimatedBand } from '../src/services/scoring.ts';

// Exercise the actual workspace with isolated network adapters, not a second UI implementation.
test('practice and exam require submit confirmation, allow cancellation, and reveal grading only after confirming', async () => {
  const cache = resolve('node_modules/.cache'); mkdirSync(cache, {recursive:true});
  const temp = mkdtempSync(join(cache,'workspace-test-'));
  const output = join(temp,'workspace.cjs');
  try {
    await build({entryPoints:['src/components/TestWorkspace.tsx'], outfile:output, bundle:true, platform:'node', format:'cjs', packages:'external', plugins:[{name:'offline-workspace',setup(builder){
      builder.onResolve({filter:/services\/auth$/},()=>({path:'auth',namespace:'offline'}));
      builder.onResolve({filter:/(?:^|\/)firebase$/},()=>({path:'firebase',namespace:'offline'}));
      builder.onResolve({filter:/services\/(assessmentClient|firestoreAdapter)$/},args=>({path:args.path.endsWith('assessmentClient')?'assessment':'store',namespace:'offline'}));
      builder.onLoad({filter:/.*/,namespace:'offline'},args=>({contents:args.path==='auth'?'export async function loginWithGoogle(){}':args.path==='firebase'?'export const auth={get currentUser(){return globalThis.__workspaceUser||null}};':args.path==='assessment'?'export async function assessmentRequest(url,payload){return globalThis.__scoreRequest(url,payload)}':'export const firestoreAdapter={put:async()=>{}};'}));
    }}]});
    const {TestWorkspace}=createRequire(import.meta.url)(output);
    for (const mode of ['practice','exam','solution','member']) {
      const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
      const storage=new Map<string,string>();
      let requests=0;
      const questions=Array.from({length:40},(_,i)=>({number:i+1,kind:'fill_blank',answer:'yes',explanationHtml:'<p>Source explanation.</p>'}));
      const numbers=questions.map(q=>q.number);
      const keys=Object.fromEntries(questions.map(q=>[q.number,q]));
      const owner=mode==='member'?'student-one':'guest',actualMode=mode==='member'?'practice':mode;
      storage.set(`reading-room:v4:${owner}:${mode}:${actualMode}`, JSON.stringify({responses:Object.fromEntries(numbers.slice(0,30).map(n=>[n,'yes']))}));
      Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true,
        localStorage:{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value)},
        __workspaceUser:mode==='member'?{uid:owner}:null,
        __scoreRequest:async(url:string,payload:any)=>{
          requests++; if(mode==='solution'){assert.equal(url,'/api/test-review');return {keys};}assert.equal(url,'/api/submit-exam');
          const result=scoreTest([{numbers,keys}],payload.responses);
          return {attemptId:payload.attemptId,result,band:estimatedBand(result),keys};
        }});
      const test={schemaVersion:1,id:'test-one',title:'Test',skill:'reading',access:'free',status:'published',source:'Forecast',duration:60,createdAt:1,updatedAt:1,parts:[{id:'p0',title:'Airborne Dentists',passageHtml:'<p>A passage.</p>',questionHtml:'<p>Question prompt</p><span data-slot="s0"></span>',slots:{s0:{id:'s0',type:'text',numbers:[1],label:'Complete the sentence',options:[]}},questions:questions.map(q=>({...q,answer:'',explanationHtml:''}))}]};
      const noop=()=>{};
      let root=createRoot(document.getElementById('root')!);
      try {
        await act(async()=>root.render(React.createElement(TestWorkspace,{test,mode:mode==='solution'?'practice':actualMode,initialSolution:mode==='solution',sessionId:mode,initialDurationMinutes:60,profile:{id:owner,fontSize:18},onSessionActive:noop,onHistorySaved:noop,onReturnToLibrary:noop,onSaveVocabulary:async()=>{},onNotify:noop})));
        if(mode==='solution'){
          assert.equal(requests,1);assert.match(document.querySelector('.slot-solution')!.textContent!,/Answer 1: yes/);assert.ok((document.querySelector('.fill-input') as HTMLInputElement).disabled);
          await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);
          await act(async()=>root.render(React.createElement(TestWorkspace,{test,mode:'practice',initialSolution:false,sessionId:mode,initialDurationMinutes:0,profile:{id:owner,fontSize:18},onSessionActive:noop,onHistorySaved:noop,onReturnToLibrary:noop,onSaveVocabulary:async()=>{},onNotify:noop})));
          assert.equal(requests,1,'practice must not request solutions after visiting the answer page');assert.equal(document.querySelector('.solution-score-banner'),null);assert.equal((document.querySelector('.fill-input') as HTMLInputElement).disabled,false);continue;
        }
        assert.equal(requests,0,'opening a test must not fetch solutions');
        assert.equal(document.querySelector('.review-toggles .toggle'),null);
        assert.equal(document.querySelector('.explanation-card'),null);
        assert.equal(document.querySelector('.answer-tag'),null);
        if(mode==='practice'){
          const flagMode=document.querySelector('[aria-label="Flag questions"]')!;await act(async()=>flagMode.dispatchEvent(new window.Event('click',{bubbles:true})));
          const question=document.querySelector('[aria-label="Question 1"]')!;await act(async()=>question.dispatchEvent(new window.Event('click',{bubbles:true})));
          assert.ok(document.querySelector('[aria-label="Question 1, flagged"]'));assert.match(document.querySelector('.question-flag')!.getAttribute('aria-label')!,/Unflag/);
          await act(async()=>document.querySelector('.question-flag')!.dispatchEvent(new window.Event('click',{bubbles:true})));
          assert.equal(document.querySelector('[aria-label="Question 1, flagged"]'),null);
        }
        const submit=[...document.querySelectorAll('button')].find(b=>b.textContent==='Submit test')!;
        await act(async()=>submit.dispatchEvent(new window.Event('click',{bubbles:true})));
        assert.equal(requests,0,'pressing Submit must not grade before confirmation');
        assert.ok(document.querySelector('dialog[open]'));
        const cancel=[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Cancel')!;
        await act(async()=>cancel.dispatchEvent(new window.Event('click',{bubbles:true})));
        assert.equal(requests,0);
        assert.equal(document.querySelector('.results-panel'),null);
        await act(async()=>submit.dispatchEvent(new window.Event('click',{bubbles:true})));
        const confirm=[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Confirm submission')!;
        await act(async()=>confirm.dispatchEvent(new window.Event('click',{bubbles:true})));
        assert.equal(requests,1);
        assert.equal(document.querySelector('.results-panel'),null,'submission reveals answers without a blocking score modal');
        assert.match(document.querySelector('.solution-score-banner')!.textContent!,/Band 7\.0/);
        assert.equal(readAttempts(localStorage,owner).length,mode==='member'?1:0,'only signed-in results save quietly in history');
        assert.equal(document.querySelectorAll('.solution-score-banner button[aria-pressed]').length,2);
        assert.match(document.querySelector('.explanation-card')!.textContent!,/Correct answer: yes.*Source explanation/s);
        assert.ok((document.querySelector('.fill-input') as HTMLInputElement).disabled);
      } finally {await act(async()=>root.unmount());}
    }
  } finally {rmSync(temp,{recursive:true,force:true});}
});

