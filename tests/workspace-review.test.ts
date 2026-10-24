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
    for (const variant of ['practice','exam','solution','member','listening','listening-loading','listening-solution','practice-expiry','exam-expiry']) {
      const listening=variant.startsWith('listening'),expiry=variant.endsWith('-expiry');
      const mode=expiry?variant.split('-')[0]:variant==='listening'||variant==='listening-loading'?'practice':variant==='listening-solution'?'solution':variant;
      const {window}=parseHTML('<html><body><div id="root"></div></body></html>');
      Object.assign(window.HTMLElement.prototype,{load(){},pause(){},play(){return Promise.resolve()}});
      const storage=new Map<string,string>();
      let requests=0;
      const questions=Array.from({length:40},(_,i)=>({number:i+1,kind:'fill_blank',answer:'yes',explanationHtml:'<p>Source explanation.</p>'}));
      const numbers=questions.map(q=>q.number);
      const keys=Object.fromEntries(questions.map(q=>[q.number,q]));
      const owner=mode==='member'?'student-one':'guest',actualMode=mode==='member'?'practice':mode;
      storage.set(`reading-room:v4:${owner}:${mode}:${actualMode}`, JSON.stringify({...(expiry?{remaining:0}:{}),responses:Object.fromEntries(numbers.slice(0,30).map(n=>[n,'yes']))}));
      Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true,
        localStorage:{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value)},
        __workspaceUser:mode==='member'?{uid:owner}:null,
        __scoreRequest:async(url:string,payload:any)=>{
          requests++; if(mode==='solution'){assert.equal(url,'/api/test-review');return {keys,transcripts:{p0:'<p>PRIVATE LISTENING TRANSCRIPT</p>'}};}assert.equal(url,'/api/submit-exam');
          const result=scoreTest([{numbers,keys}],payload.responses);
          return {attemptId:payload.attemptId,result,band:estimatedBand(result),keys,transcripts:{p0:'<p>PRIVATE LISTENING TRANSCRIPT</p>'}};
        }});
      const test={schemaVersion:1,id:'test-one',title:'Test',skill:listening?'listening':'reading',access:'free',status:'published',source:'Forecast',duration:60,createdAt:1,updatedAt:1,parts:[{id:'p0',title:'Airborne Dentists',audio:undefined as string|undefined,passageHtml:listening?'':'<p>A passage.</p>',questionHtml:'<p>Question prompt</p><span data-slot="s0"></span>',slots:{s0:{id:'s0',type:'text',numbers:[1],label:'Complete the sentence',options:[]}},questions:questions.map(q=>({...q,answer:'',explanationHtml:''}))}]};
      const originalFetch=globalThis.fetch;
      const pendingDownloads:((r:Response)=>void)[]=[];
      if(variant==='listening-loading'){
        test.parts[0].audio='https://audio.test/one.mp3';
        test.parts.push({...test.parts[0],id:'p1',title:'Part 2',audio:'https://audio.test/two.mp3',questions:[{number:41,kind:'fill_blank',answer:'',explanationHtml:''}]});
        globalThis.fetch=async()=>new Promise(resolve=>pendingDownloads.push(resolve));
      }
      const noop=()=>{};
      let root=createRoot(document.getElementById('root')!);
      try {
        await act(async()=>root.render(React.createElement(TestWorkspace,{test,mode:mode==='solution'?'practice':actualMode,initialSolution:mode==='solution',sessionId:mode,initialDurationMinutes:60,profile:{id:owner,fontSize:18},onSessionActive:noop,onHistorySaved:noop,onReturnToLibrary:noop,onSaveVocabulary:async()=>{},onNotify:noop})));
        if(variant==='listening-loading'){
          assert.match(document.querySelector('.questions-pane')!.textContent!,/Question prompt/);
          assert.equal(document.querySelector('.audio-loading-gate'),null);
          assert.ok(document.querySelector('.audio-background-progress'));
          const play=document.querySelector<HTMLButtonElement>('[aria-label="Play recording"]')!;
          assert.equal(play.disabled,true);assert.equal(document.querySelector('audio')!.hasAttribute('src'),false);
          const clock=document.querySelector('.reader-clock')!.textContent;
          await act(async()=>new Promise(resolve=>setTimeout(resolve,1100)));
          assert.equal(document.querySelector('.reader-clock')!.textContent,clock,'timer waits for complete recordings');
          await act(async()=>pendingDownloads.shift()!(new Response('first audio',{headers:{'Content-Type':'audio/mpeg'}})));
          assert.equal(play.disabled,true,'one complete file must not unlock an incomplete test');
          await act(async()=>pendingDownloads.shift()!(new Response('second audio',{headers:{'Content-Type':'audio/mpeg'}})));
          assert.equal(play.disabled,false);assert.match(document.querySelector('audio')!.getAttribute('src')!,/^blob:/);assert.equal(document.querySelector('.audio-background-progress'),null);
          const pane=document.querySelector('.questions-pane')! as HTMLElement;pane.scrollTop=500;
          await act(async()=>document.querySelectorAll('.reader-passage-tabs button')[1].dispatchEvent(new window.Event('click',{bubbles:true})));
          assert.equal(pane.scrollTop,0,'changing parts resets the question scroll position');
          await act(async()=>document.querySelector('[aria-label="Display settings"]')!.dispatchEvent(new window.Event('click',{bubbles:true})));
          const volume=document.querySelector<HTMLInputElement>('[aria-label="Listening volume"]')!,speed=document.querySelector<HTMLInputElement>('[aria-label="Listening speed"]')!;
          volume.value='.4';speed.value='7';await act(async()=>{volume.dispatchEvent(new window.Event('input',{bubbles:true}));speed.dispatchEvent(new window.Event('input',{bubbles:true}))});
          assert.equal((document.querySelector('audio')! as any).volume,.5);assert.equal((document.querySelector('audio')! as any).playbackRate,1.15);
          continue;
        }
        if(mode==='solution'){
          if(listening)assert.match(document.querySelector('.passage-pane')!.textContent!,/PRIVATE LISTENING TRANSCRIPT/);
          assert.equal(requests,1);assert.match(document.querySelector('.slot-solution')!.textContent!,/Answer 1: yes/);assert.ok((document.querySelector('.fill-input') as HTMLInputElement).disabled);
          await act(async()=>root.unmount());root=createRoot(document.getElementById('root')!);
          await act(async()=>root.render(React.createElement(TestWorkspace,{test,mode:'practice',initialSolution:false,sessionId:mode,initialDurationMinutes:0,profile:{id:owner,fontSize:18},onSessionActive:noop,onHistorySaved:noop,onReturnToLibrary:noop,onSaveVocabulary:async()=>{},onNotify:noop})));
          assert.equal(requests,1,'practice must not request solutions after visiting the answer page');assert.equal(document.querySelector('.solution-score-banner'),null);assert.equal((document.querySelector('.fill-input') as HTMLInputElement).disabled,false);continue;
        }
        if(expiry){
          if(actualMode==='exam'){assert.equal(requests,1,'test expiry automatically submits once');assert.ok(document.querySelector('.result-page-dialog[open]'));}
          else{assert.equal(requests,0,'practice expiry waits for the learner');assert.match(document.querySelector('.leave-test-dialog')!.textContent!,/Practice time is up/);const keep=[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Keep practising')!;await act(async()=>keep.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(requests,0);assert.equal(document.querySelector('.leave-test-dialog'),null);assert.equal((document.querySelector('.fill-input') as HTMLInputElement).disabled,false);}
          continue;
        }
        assert.equal(requests,0,'opening a test must not fetch solutions');
        if(listening){assert.equal(document.querySelector('.passage-pane'),null);assert.equal(document.body.textContent!.includes('PRIVATE LISTENING TRANSCRIPT'),false);}
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
        assert.ok(document.querySelector('.result-page-dialog[open]'),'submission opens the dedicated result screen');
        assert.match(document.querySelector('.result-session-meta')!.textContent!,actualMode==='exam'?/Test mode/:/Practice mode/);
        assert.ok(document.querySelector('.reader-footer-actions .answer-sheet-trigger'),'answer sheet sits beside submit');
        const review=[...document.querySelectorAll('.result-page-actions button')].find(b=>b.textContent!.includes('Review my answers'))!;
        await act(async()=>review.dispatchEvent(new window.Event('click',{bubbles:true})));
        assert.equal(document.querySelector('.result-page-dialog'),null);
        if(owner!=='guest'){const record=readAttempts(localStorage,owner)[0];assert.equal(record.mode,'practice');assert.equal(typeof record.elapsedSeconds,'number');assert.ok(record.startedAt);assert.ok(record.completedAt)}
        if(listening)assert.match(document.querySelector('.passage-pane')!.textContent!,/PRIVATE LISTENING TRANSCRIPT/);
        assert.equal(document.querySelector('.results-panel'),null,'legacy results modal is replaced by the dedicated score screen');
        assert.match(document.querySelector('.solution-score-banner')!.textContent!,/Estimated band 7\.0/);
        assert.equal(readAttempts(localStorage,owner).length,mode==='member'?1:0,'only signed-in results save quietly in history');
        assert.equal(document.querySelectorAll('.solution-score-banner button[aria-pressed]').length,2);
        assert.match(document.querySelector('.explanation-card')!.textContent!,/Correct answer: yes.*Source explanation/s);
        assert.ok((document.querySelector('.fill-input') as HTMLInputElement).disabled);
      } finally {globalThis.fetch=originalFetch;await act(async()=>root.unmount());}
    }
  } finally {rmSync(temp,{recursive:true,force:true});}
});

