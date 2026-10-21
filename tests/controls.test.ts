import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerControl } from '../src/components/QuestionLayout.tsx';
import type { EditablePart, TestSlot } from '../src/types.ts';
const part: EditablePart={id:'p0',title:'Passage',passageHtml:'',questionHtml:'',slots:{},questions:[{number:1,kind:'fill_blank',answer:'SECRET_KEY'}]};
const base={part,responses:{},showAnswers:false,disabled:false,onChange:()=>{},onMultiChange:()=>{}};
test('blank text/select controls are labelled and never prefilled with the answer',()=>{
  for(const type of ['text','select'] as const){
    const slot:TestSlot={id:'s0',numbers:[1],type,label:'Prompt',options:[{value:'A',label:'First'}]};
    const html=renderToStaticMarkup(React.createElement(AnswerControl,{...base,slot}));
    assert.match(html,/Answer for question 1/);assert.doesNotMatch(html,/SECRET_KEY/);
    assert.match(html,type==='text'?/<input/:/<select/);
  }
});
test('radio and multi-select choices reflect student responses rather than key values',()=>{
  for(const type of ['radio','multi'] as const){
    const slot:TestSlot={id:'s0',numbers:type==='multi'?[1,2]:[1],type,label:'Choose',options:[{value:'A',label:'First'},{value:'B',label:'Second'}]};
    const html=renderToStaticMarkup(React.createElement(AnswerControl,{...base,slot,responses:{1:'B'}}));
    assert.match(html,/checked=""/);assert.doesNotMatch(html,/SECRET_KEY/);
    assert.match(html,type==='multi'?/type="checkbox"/:/type="radio"/);
  }
});
test('solutions appear only when explicitly enabled and submitted controls can be locked',()=>{
  const slot:TestSlot={id:'s0',numbers:[1],type:'text',label:'',options:[]};
  const html=renderToStaticMarkup(React.createElement(AnswerControl,{...base,slot,showAnswers:true,disabled:true}));
  assert.match(html,/SECRET_KEY/);assert.match(html,/disabled=""/);
});

