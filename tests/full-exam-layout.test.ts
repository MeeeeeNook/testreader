import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {FullExamSession} from '../src/components/FullExamSession';

test('active full test escapes the catalog layout and restores page interaction on exit',async()=>{
 const {window}=parseHTML('<html><body style="overflow:auto"><div id="root"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const site=document.getElementById('root')!,root=createRoot(site);
 try{
  await act(async()=>root.render(React.createElement('div',{className:'studio-hub'},React.createElement('header',null,'Site navigation'),React.createElement('main',{id:'studioContent'},React.createElement(FullExamSession,null,React.createElement('div',{className:'app'},React.createElement('main',{className:'main'},'Listening questions')))))));
  const session=document.querySelector('.full-exam-session')!;
  assert.equal(session.parentElement,document.body);
  assert.equal(session.closest('#studioContent'),null);
  assert.equal(session.closest('.studio-hub'),null);
  assert.equal(site.querySelector('.app'),null);
  assert.match(session.textContent!,/Listening questions/);
  assert.equal(site.inert,true);
  assert.equal(document.body.style.overflow,'hidden');
  await act(async()=>root.render(React.createElement('main',{id:'studioContent'},'Full test results')));
  assert.equal(document.querySelector('.full-exam-session'),null);
  assert.equal(site.inert,false);
  assert.equal(document.body.style.overflow,'auto');
 }finally{await act(async()=>root.unmount())}
});
