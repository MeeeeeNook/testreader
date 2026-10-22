import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
import {FontSizeSlider} from '../src/components/FontSizeSlider';
import {Modal} from '../src/components/Modal';
import {DictionaryPanel} from '../src/components/DictionaryPanel';
import {TopHeader} from '../src/components/TopHeader';
import {readerSessionKey,readReaderSession} from '../src/services/readerSession';
import {lookupDictionary,vocabularyFromMeaning} from '../src/services/dictionary';

test('solution guides and stale v3 records never become completed practice sessions',()=>{
  const storage=new Map<string,string>();
  const old='reading-room:v3:guest:direct:test:practice';
  storage.set(old,JSON.stringify({scored:true,responses:{1:'old answer'}}));
  const key=readerSessionKey('guest','direct:test','practice');
  const store={getItem:(key:string)=>storage.get(key)||null};
  assert.deepEqual(readReaderSession(store,key),{});
  const solution=readerSessionKey('guest','direct:test','practice',true);
  assert.notEqual(key,solution);
  storage.set(solution,JSON.stringify({scored:true}));
  assert.deepEqual(readReaderSession(store,key),{});
  storage.set(key,JSON.stringify({responses:{1:'my answer'},flags:[2],remaining:123}));
  assert.equal(readReaderSession(store,key).responses[1],'my answer');
  assert.deepEqual(readReaderSession(store,solution,true),{});
});

test('font size slider puts the 18px default at its midpoint',()=>{
  const html=renderToStaticMarkup(React.createElement(FontSizeSlider,{value:18,onChange:()=>{}}));
  assert.match(html,/type="range"/);assert.match(html,/min="14"/);assert.match(html,/max="22"/);assert.match(html,/value="18"/);assert.match(html,/Reset font size to default/);
});

test('Google account avatars use the photo supplied by authentication',()=>{
  const user:any={displayName:'Learner',photoURL:'https://example.test/google-avatar.png',providerData:[]};
  const html=renderToStaticMarkup(React.createElement(TopHeader,{user,profile:{} as any,role:'student',crumb:'',onUpdateProfile:()=>{},onOpenProfileModal:()=>{}}));
  assert.match(html,/src="https:\/\/example.test\/google-avatar.png"/);assert.match(html,/alt="Google account avatar"/);
});

test('dictionary vocabulary uses the chosen API meaning and part of speech, not a hardcoded noun',async()=>{
  const entry=await lookupDictionary('towards',undefined,async()=>new Response(JSON.stringify({exists:true,word:'towards',results:[{meanings:[{definition:'In the direction of.',pos:'preposition',example:'She walked towards the door.'},{definition:'In relation to.',pos:'preposition'}]}]})));
  assert.deepEqual(vocabularyFromMeaning(entry,entry.results[0].meanings[1],'Source context.'),{word:'towards',meaning:'In relation to.',partOfSpeech:'preposition',example:'Source context.'});
  await assert.rejects(lookupDictionary('around 900 people'),/English word/);
});

test('dictionary save confirms only the saved meaning and reports a rejected save without claiming success',async()=>{
  const {window}=parseHTML('<html><body><div id="root"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const original=globalThis.fetch,records:any[]=[];
  globalThis.fetch=async()=>new Response(JSON.stringify({exists:true,word:'through',results:[{meanings:[{definition:'From one side to the other.',pos:'preposition'},{definition:'Finished.',pos:'adjective'}]}]}));
  const root=createRoot(document.getElementById('root')!);let reject=false;
  try {
    await act(async()=>root.render(React.createElement(DictionaryPanel,{initialWord:'through',saveIntent:true,onClose:()=>{},onSave:async item=>{if(reject)throw new Error('Could not save. Please retry.');records.push(item);}})));
    let buttons=[...document.querySelectorAll<HTMLButtonElement>('.dictionary-save')];
    await act(async()=>buttons[1].dispatchEvent(new window.Event('click',{bubbles:true})));
    assert.equal(records[0].partOfSpeech,'adjective');assert.equal(records[0].meaning,'Finished.');
    assert.match(document.querySelector('[role=status]')!.textContent!,/saved to your vocabulary/);
    assert.equal(document.querySelectorAll('.dictionary-save:disabled').length,1);
    reject=true;buttons=[...document.querySelectorAll<HTMLButtonElement>('.dictionary-save')];
    await act(async()=>buttons[0].dispatchEvent(new window.Event('click',{bubbles:true})));
    assert.match(document.querySelector('[role=alert]')!.textContent!,/Could not save/);assert.equal(document.querySelector('[role=status]'),null);assert.equal(records.length,1);
  }finally{await act(async()=>root.unmount());globalThis.fetch=original;}
});

test('modal locks background scrolling and restores it on close',async()=>{
  const {window}=parseHTML('<html><body><div id="root"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  document.body.style.overflow='auto';const root=createRoot(document.getElementById('root')!);
  await act(async()=>root.render(React.createElement(Modal,{label:'Choose mode',onClose:()=>{},children:React.createElement('button',null,'Start')})));
  assert.ok(document.querySelector('dialog[open]'));assert.equal(document.body.style.overflow,'hidden');
  await act(async()=>root.unmount());assert.equal(document.body.style.overflow,'auto');
});
