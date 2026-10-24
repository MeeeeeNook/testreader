import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {TestSetup} from '../src/components/TestSetup';
import {VocabularyView} from '../src/components/VocabularyView';
import {createTestLaunch} from '../src/services/sessionLaunch';
import {parseRoute} from '../src/services/browserHistory.js';
import {vocabularyFromMeaning} from '../src/services/dictionary';
const environment=()=>{const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});return window;};
const sample=(skill:string)=>({id:'test_parent',slug:'forecast-test',title:'Forecast test',skill,duration:40,source:'random-source-id',parts:[{id:'p1',title:'Part one',passageHtml:'Transcript or reading',questions:[{number:1,answer:'secret',explanationHtml:'private',referenceQuote:'quote'}],slots:{}}]} as any);
test('Start practice and exam enter a workspace for either skill, retain settings on reload and strip keys',async()=>{
 const window=environment(),root=createRoot(document.getElementById('app')!);
 try{for(const skill of ['reading','listening'])for(const mode of ['practice','exam'] as const){
  const test=sample(skill);let route:any,snapshot:any;
  await act(async()=>root.render(React.createElement(TestSetup,{test,mode,minutes:mode==='exam'?40:0,section:'all',onMode:()=>{},onMinutes:()=>{},onSection:()=>{},onClose:()=>{},onStart:()=>{const launch=createTestLaunch(test,mode,mode==='exam'?40:0,'new-session');route=parseRoute(launch.path);snapshot=JSON.parse(JSON.stringify(launch.snapshot));}})));
  assert.match(document.body.textContent!,/Test ID: test_parent/);assert.doesNotMatch(document.body.textContent!,/random-source-id/);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Start '+mode)!.dispatchEvent(new window.Event('click',{bubbles:true})));
  assert.deepEqual(route,{name:'workspace',id:'test_parent',session:'new-session'});assert.equal(snapshot.mode,mode);assert.equal(snapshot.minutes,mode==='exam'?40:0);assert.equal(snapshot.test.parts[0].questions[0].answer,'');assert.equal(snapshot.test.parts[0].passageHtml,skill==='listening'?'':'Transcript or reading');
 }
 const part=createTestLaunch({...sample('reading'),id:'test_parent_part_0',sourceTestId:'test_parent',sectionIds:['p1']},'practice',15,'part-session');assert.equal(parseRoute(part.path).id,'test_parent');assert.deepEqual(part.snapshot.test.sectionIds,['p1']);assert.equal(part.snapshot.minutes,15);
 }finally{await act(async()=>root.unmount());}
});
test('notebook exposes deletion on each row, reports failures, and removes words only after success',async()=>{
 const window=environment(),root=createRoot(document.getElementById('app')!);let fail=true,deleted:string[]=[];
 function Notebook(){const [words,setWords]=React.useState<any[]>([{id:'one',word:'district',meaning:'First meaning.\nSecond meaning.\nThird meaning.',partOfSpeech:'noun',example:'Unused example.',createdAt:1}]);return React.createElement(VocabularyView,{profile:{id:'learner'} as any,vocabulary:words,onSaveWord:async()=>{},onUpdateProfile:async()=>{},onNotify:()=>{},onDeleteWord:async id=>{if(fail)throw Error('Connection failed. Retry deletion.');deleted.push(id);setWords(previous=>previous.filter(w=>w.id!==id));}});}
 try{await act(async()=>root.render(React.createElement(Notebook)));assert.equal(document.querySelectorAll('thead th').length,4);assert.doesNotMatch(document.querySelector('table')!.textContent!,/Example|Unused example/);assert.equal(document.querySelectorAll('details li').length,1);
  await act(async()=>document.querySelector('[aria-label="Delete district"]')!.dispatchEvent(new window.Event('click',{bubbles:true})));
  const confirm=()=>[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Delete')!;
  await act(async()=>confirm().dispatchEvent(new window.Event('click',{bubbles:true})));assert.match(document.querySelector('dialog')!.textContent!,/Connection failed/);assert.equal(document.querySelectorAll('tbody tr').length,1);assert.deepEqual(deleted,[]);
  fail=false;await act(async()=>confirm().dispatchEvent(new window.Event('click',{bubbles:true})));assert.deepEqual(deleted,['one']);assert.equal(document.querySelectorAll('tbody tr').length,0);assert.equal(document.querySelector('dialog'),null);
 }finally{await act(async()=>root.unmount());}
});
test('saved dictionary meanings omit examples even when the API supplies one',()=>{assert.equal(vocabularyFromMeaning({word:'district',results:[]},{definition:'An area.',example:'This is a district.'}).example,'');});
