import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import JSZip from 'jszip';
import {prepareImport,disposeImport,replaceImportAssets} from '../src/services/importPreview';
import {listeningTracks,assignImportedAudio} from '../src/services/listening';
import {listeningAudioZip} from '../src/services/listeningExport';
import {readingDocument} from '../src/services/documentExport';
import {buildPrivateKeys} from '../src/services/privateKeys';
import {loadAssessment} from '../server/assessment';
import {ListeningAudio} from '../src/components/ListeningAudio';
import {ListeningMediaEditor} from '../src/components/ListeningMediaEditor';
import {renderToStaticMarkup} from 'react-dom/server';
import type {EditableTest} from '../src/types';

function dom(){const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.defineProperty(window.DocumentFragment.prototype,'textContent',{configurable:true,get(){return (Array.from(this.childNodes) as Node[]).map((n:Node)=>n.textContent||'').join('')}});Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});return window}
function sample():EditableTest{return {schemaVersion:1,id:'listen',title:'Listening test',skill:'listening',source:'Forecast',status:'draft',access:'free',duration:30,createdAt:1,updatedAt:1,parts:Array.from({length:4},(_,i)=>({id:'p'+i,position:i+1,title:'Part '+(i+1),passageHtml:'<p>PRIVATE TRANSCRIPT '+i+'</p>',questionHtml:'<p>QUESTION PROMPT <span data-slot="s'+i+'"></span></p>',slots:{['s'+i]:{id:'s'+i,numbers:[i+1],type:'text' as const,label:'',options:[]}},questions:[{number:i+1,kind:'fill_blank',answer:'answer'+i}],audio:'https://audio.example/part-'+(i+1)+'.mp3',audioName:'part-'+(i+1)+'.mp3'}))}}
async function fixture(name:string,audios=4){const zip=new JSZip();const parts=Array.from({length:4},(_,i)=>({topic_content:'<p>Transcript '+i+'</p>',question_content:`<p>Part ${i+1}</p><span class="question fill_blank" question-number="${i*10+1}"></span>`,questions:[i*10+1]}));zip.file('page.html',`<div class="header-title">${name}</div><script>const parts=${JSON.stringify(parts)};const audio_listenings=${JSON.stringify(Array.from({length:audios},(_,i)=>'https://media.example/part-'+(i+1)+'.mp3'))};const is_exam_listening=true;</script>`);for(let i=0;i<audios;i++)zip.file('part-'+(i+1)+'.mp3','ID3-'+name+'-'+i);return new File([new Uint8Array(await zip.generateAsync({type:'uint8array'})).buffer],name+'.zip')}

test('Listening ZIP import reads audio into memory, scopes identical names per archive and assigns all parts',async()=>{
 dom();const plan=await prepareImport([await fixture('First'),await fixture('Second')]);
 try{assert.equal(plan.candidates.length,2);assert.equal(plan.recordings?.length,8);const first=plan.candidates[0].test,second=plan.candidates[1].test;assert.equal(first.skill,'listening');assert.equal(first.duration,40);assert.equal(first.title,'First');assert.deepEqual(first.parts.map(p=>p.audioName),['part-1.mp3','part-2.mp3','part-3.mp3','part-4.mp3']);assert.notEqual(first.parts[0].audio,second.parts[0].audio);assert.equal(await plan.recordings![0].blob.text(),'ID3-First-0');const uploads=new Map([[first.parts[0].audio!,'https://storage.example/audio.mp3']]);const saved=replaceImportAssets(first,uploads);assert.equal(saved.parts[0].audio,saved.audioFiles![0].url);assert.equal(saved.parts[0].audio,'https://storage.example/audio.mp3');}finally{disposeImport(plan)}
});
test('a single shared recording plays once; missing section audio never shifts later sections',()=>{
 const test=sample(),one=assignImportedAudio(test,[{id:'full',name:'full.mp3',url:'full'}],[]);assert.equal(listeningTracks(one.parts).length,1);assert.equal(listeningTracks(one.parts)[0].partIds.length,4);
 const partial=assignImportedAudio(test,[{id:'one',name:'section-1.mp3',url:'one'},{id:'three',name:'section-3.mp3',url:'three'},{id:'four',name:'section-4.mp3',url:'four'}],[]);assert.equal(partial.parts[1].audio,'');assert.equal(partial.parts[2].audio,'three');
 one.parts[0].audioEnd=10;one.parts[1].audioStart=10;assert.equal(listeningTracks(one.parts).length,3);
});
test('transcripts are private solution data and selected/custom reviews return only their sections',async()=>{
 const t=sample(),data=buildPrivateKeys(t,123);assert.equal(data.transcripts.p0,'<p>PRIVATE TRANSCRIPT 0</p>');
 const store={test:async()=>({status:'published',title:t.title,skill:'listening'}),sections:async()=>t.parts.map((p,index)=>({...p,index,passageHtml:''})),keys:async()=>data};
 const single=await loadAssessment(store,{testId:'listen',sectionIds:['p2']},false);assert.deepEqual(single.transcripts,{p2:'<p>PRIVATE TRANSCRIPT 2</p>'});
 const mock=await loadAssessment(store,{sourceSections:[{testId:'listen',sectionId:'p2'},{testId:'listen',sectionId:'p0'}]},false);assert.deepEqual(mock.transcripts,{p0:'<p>PRIVATE TRANSCRIPT 2</p>',p1:'<p>PRIVATE TRANSCRIPT 0</p>'});
});
test('Listening worksheet excludes transcripts, separate transcript documents exclude questions',()=>{
 dom();const t=sample(),worksheet=JSON.stringify(readingDocument(t,{includeAnswers:false,includeExplanations:false})),transcript=JSON.stringify(readingDocument(t,{includeAnswers:false,includeExplanations:false,transcriptOnly:true}));assert.match(worksheet,/QUESTION PROMPT/);assert.doesNotMatch(worksheet,/PRIVATE TRANSCRIPT/);assert.match(transcript,/PRIVATE TRANSCRIPT/);assert.doesNotMatch(transcript,/QUESTION PROMPT/);
});
test('audio ZIP downloads each original file once and preserves playback instructions',async()=>{
 const t=sample();t.parts[1].audio=t.parts[0].audio;let calls=0;const zip=await JSZip.loadAsync(await(await listeningAudioZip(t,async()=>{calls++;return new Response('ID3-original')})).arrayBuffer());assert.equal(calls,3);assert.match(await zip.file('Playback-order.txt')!.async('string'),/Part 1 \/ Part 2/);assert.equal(Object.keys(zip.files).filter(n=>/\.mp3$/.test(n)).length,3);
});
test('admin audio editor exposes selectors for every part, replacements and clip settings',()=>{
 const html=renderToStaticMarkup(React.createElement(ListeningMediaEditor,{test:sample(),onChange:()=>{},onUpload:async()=>({id:'x',name:'x.mp3',url:'x'})}));assert.equal((html.match(/aria-label="Recording for part /g)||[]).length,4);assert.match(html,/Replace file/);assert.match(html,/Part 1 starts at/);assert.match(html,/Use for all parts/);
});
test('student player automatically advances audio and retains its position across question-part rerenders',async()=>{
 const window=dom();let plays=0;
 Object.assign(window.HTMLElement.prototype,{load(){},pause(){},play(this:HTMLElement){plays++;this.dispatchEvent(new window.Event('play'));return Promise.resolve()}});
 const t=sample(),root=createRoot(document.getElementById('app')!);
 try{
  await act(async()=>root.render(React.createElement(ListeningAudio,{parts:t.parts,exam:true})));
  const audio=document.querySelector('audio')!;await act(async()=>document.querySelector('button')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(plays,1);
  (audio as any).currentTime=42;await act(async()=>root.render(React.createElement(ListeningAudio,{parts:t.parts,exam:true})));assert.equal((audio as any).currentTime,42);
  await act(async()=>audio.dispatchEvent(new window.Event('ended')));assert.equal(audio.getAttribute('src'),'https://audio.example/part-2.mp3');await act(async()=>audio.dispatchEvent(new window.Event('canplay')));assert.equal(plays,2);
  await act(async()=>audio.dispatchEvent(new window.Event('error')));assert.match(document.querySelector('[role=alert]')!.textContent!,/retry/i);await act(async()=>document.querySelector('[role=alert] button')!.dispatchEvent(new window.Event('click',{bubbles:true})));assert.equal(plays,3);
 }finally{await act(async()=>root.unmount())}
});

import {toEditable} from '../src/services/importer';
import {estimatedBand} from '../src/services/scoring';
import {examMinutes} from '../src/services/sessionSettings';
test('Listening uses its own estimated band boundaries and admin exam timing',()=>{
 const result:any={total:40,ungraded:0,correct:32};assert.equal(estimatedBand(result,'listening'),7.5);assert.equal(estimatedBand(result),7);
 result.correct=15;assert.equal(estimatedBand(result,'listening'),4.5);assert.equal(estimatedBand(result),5);
 assert.equal(examMinutes(sample()),40);assert.equal(examMinutes({...sample(),duration:35}),40);assert.equal(examMinutes({...sample(),duration:12,parts:[sample().parts[0]]}),12);
});

test('mislabelled Listening blanks retain their answer control and absent transcripts do not crash import',()=>{
 dom();const t=toEditable({parts:[{topic_content:null as any,question_content:`<p>Help with <span class="question matching_heading" question-number="1"></span> books.</p>`,questions:[1]}]},{skill:'listening'});
 assert.deepEqual(Object.values(t.parts[0].slots).map(s=>s.numbers),[[1]]);assert.equal(t.parts[0].passageHtml,'');
});
