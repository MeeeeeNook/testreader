import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
import {ListeningAudio,playbackSpeeds} from '../src/components/ListeningAudio';
import {listeningTracks,dividerIssues} from '../src/services/listening';
import {preloadRecordings} from '../src/services/audioPreload';
import {AnswerSheet} from '../src/components/AnswerSheet';
import {ResultScreen} from '../src/components/ResultScreen';
import {estimatedBand,scoreInsights} from '../src/services/scoring';
const parts=[0,120,240,360].map((start,i)=>({id:'p'+i,position:i+1,title:'Part '+(i+1),audio:'https://audio.test/full.mp3',audioStart:start,passageHtml:'',questionHtml:'',slots:{},questions:[{number:i+1,kind:'text',answer:'yes'}]}));
function dom(){const {window}=parseHTML('<html><body><div id="root"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});return window}
test('shared recording dividers infer clip ends, validate partial edits and retain continuous tracks',()=>{
 const tracks=listeningTracks(parts);assert.deepEqual(tracks.map(t=>t.start),[0,120,240,360]);assert.deepEqual(tracks.map(t=>t.end),[120,240,360,undefined]);assert.equal(dividerIssues(parts).length,0);
 assert.equal(dividerIssues(parts.map((p,i)=>({...p,audioStart:i===2?0:p.audioStart}))).length,1);
 assert.equal(listeningTracks(parts.map(p=>({...p,audioStart:0}))).length,1);
});
test('player has custom controls, exact speed stops and part jumps; submission stops playback',async()=>{
 const window=dom();let pauses=0,plays=0;
 Object.assign(window.HTMLElement.prototype,{load(){},pause(this:HTMLElement){pauses++;this.dispatchEvent(new window.Event('pause'))},play(this:HTMLElement){plays++;this.dispatchEvent(new window.Event('play'));return Promise.resolve()}});
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(React.createElement(ListeningAudio,{parts,exam:false,stopSignal:0})));
  const audio=document.querySelector('audio')! as any;
  Object.defineProperty(audio,'duration',{configurable:true,value:480});
  await act(async()=>audio.dispatchEvent(new window.Event('loadedmetadata')));
  assert.equal(audio.hasAttribute('controls'),false);assert.equal(document.querySelector('a[download]'),null);
  assert.deepEqual(playbackSpeeds,[.8,.85,.9,.95,1,1.05,1.1,1.15,1.2,1.25]);
  await act(async()=>document.querySelector('[aria-label="Play recording"]')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(plays,1);
  const speed=document.querySelector('[aria-label="Playback speed"]') as HTMLInputElement;
  speed.value='7';await act(async()=>speed.dispatchEvent(new window.Event('input',{bubbles:true})));assert.equal(audio.playbackRate,1.15);
  await act(async()=>document.querySelector('[aria-label="Jump to Part 3"]')!.dispatchEvent(new window.Event('click',{bubbles:true})));
  await act(async()=>audio.dispatchEvent(new window.Event('loadedmetadata')));assert.equal(audio.currentTime,240);
  const before=pauses;await act(async()=>root.render(React.createElement(ListeningAudio,{parts,exam:false,stopSignal:1})));assert.ok(pauses>before);assert.ok(document.querySelector('[aria-label="Play recording"]'));
 }finally{await act(async()=>root.unmount())}
});
test('complete preload deduplicates shared recordings, reports bytes and cleans partial failure',async()=>{
 const previous=globalThis.fetch,create=URL.createObjectURL,revoke=URL.revokeObjectURL;let requests=0,revoked:string[]=[];const progress:number[]=[];
 URL.createObjectURL=()=> 'blob:cached-'+requests;URL.revokeObjectURL=url=>{revoked.push(url)};
 try{
  globalThis.fetch=async()=>{requests++;return new Response('recording',{headers:{'Content-Type':'audio/mpeg'}})};
  const result=await preloadRecordings(['one','one','two'],new AbortController().signal,(done,total,bytes)=>{assert.equal(total,2);progress.push(bytes)});
  assert.equal(requests,2);assert.deepEqual(Object.keys(result),['one','two']);assert.equal(progress.at(-1),18);
  requests=0;globalThis.fetch=async()=>{requests++;return requests===1?new Response('ok'):new Response(null,{status:403})};
  await assert.rejects(preloadRecordings(['one','two'],new AbortController().signal,()=>{}),/HTTP 403/);assert.deepEqual(revoked,['blob:cached-1']);
 }finally{globalThis.fetch=previous;URL.createObjectURL=create;URL.revokeObjectURL=revoke}
});
test('answer sheet groups parts, filters unanswered and jumps without revealing keys before grading',async()=>{
 const window=dom(),root=createRoot(document.getElementById('root')!);let jumped=0;
 try{await act(async()=>root.render(React.createElement(AnswerSheet,{parts,skill:'listening',responses:{1:'student response'},flags:[2],result:null,keys:{},onClose:()=>{},onJump:n=>{jumped=n}})));
 assert.match(document.body.textContent!,/1 \/ 4/);assert.equal(document.querySelectorAll('.answer-sheet-cell').length,4);assert.doesNotMatch(document.querySelector('.answer-sheet-parts')!.textContent!,/Answer: yes/);
 await act(async()=>[...document.querySelectorAll('.answer-sheet-filters button')].find(b=>b.textContent==='Unanswered')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(document.querySelectorAll('.answer-sheet-cell').length,3);
 await act(async()=>document.querySelector('[aria-label="Go to question 2"]')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(jumped,2);
 }finally{await act(async()=>root.unmount())}
});
test('score screen offers review or finish and never fabricates a band for a single part',()=>{
 const result={total:4,correct:1,incorrect:1,blank:2,ungraded:0,gradable:4,rows:[]};assert.equal(estimatedBand(result,'listening'),null);
 const html=renderToStaticMarkup(React.createElement(ResultScreen,{test:{parts,skill:'listening',title:'Listening sample'} as any,result,band:null,elapsedSeconds:754,mode:'practice',onReview:()=>{},onLeave:()=>{}}));
 assert.match(html,/12m 34s/);assert.match(html,/Practice mode/);assert.match(html,/Finish for now/);assert.match(html,/Review my answers/);assert.match(html,/1\/4/);
 const full={...result,total:40,gradable:40,correct:30,incorrect:8,blank:2};assert.deepEqual(scoreInsights(full,'listening').nextBand,{band:7.5,needed:2});assert.equal(scoreInsights(full,'listening').accuracy,.75);assert.equal(estimatedBand({...full,ungraded:1},'listening'),null);
});
