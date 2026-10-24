import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
import JSZip from 'jszip';
import {TestSetup} from '../src/components/TestSetup';
import {PracticeCatalog} from '../src/components/PracticeCatalog';
import {directSession,examMinutes,setupLink} from '../src/services/sessionSettings';
import {parseRoute} from '../src/services/browserHistory.js';
import {readingDocument,exportReadingDocument} from '../src/services/documentExport';
import {summarizeFiles} from '../src/services/storageUsage';

const file:any={schemaVersion:1,id:'test',title:'Ocean research',skill:'reading',duration:60,source:'Forecast',access:'free',status:'published',createdAt:1,updatedAt:1,parts:[{id:'p1',title:'Ocean research',passageHtml:'<p>The ocean is vast.</p>',questionHtml:'<p>1. The ocean is <span data-slot="s1"></span>.</p>',slots:{s1:{id:'s1',type:'text',numbers:[1],label:'',options:[]}},questions:[{number:1,kind:'text',answer:'SECRET_ANSWER',explanationHtml:'<p>SECRET_EXPLANATION</p>'}]}]};

test('direct codes are unlimited practice; explicit exam links enforce passage timing',()=>{
  assert.deepEqual(directSession(new URLSearchParams(),file),{mode:'practice',minutes:0});
  assert.deepEqual(directSession(new URLSearchParams('mode=exam&minutes=0'),file),{mode:'exam',minutes:20});
  assert.equal(directSession(new URLSearchParams('minutes=15'),file).minutes,15);
  assert.equal(directSession(new URLSearchParams('minutes=-5'),file).minutes,0);
  assert.equal(examMinutes({...file,parts:[file.parts[0],file.parts[0],file.parts[0]]}),60);
  assert.equal(examMinutes({...file,skill:'listening',duration:30,parts:Array(4).fill(file.parts[0])}),40);
});

test('catalog opens setup for the selected passage and still supplies a separate public solution link',()=>{
  const testMeta={...file,parts:undefined,passages:1,questions:1,sectionSummaries:[{id:'p1',index:0,title:'Ocean research',questions:1,kinds:[]}]};
  const html=renderToStaticMarkup(React.createElement(PracticeCatalog,{tests:[testMeta],attempts:[],profile:{id:'guest'} as any,location:'/practice',onNavigate:()=>{}}));
  assert.match(html,/href="\/tests\/test\/sections\/p1"/);
  assert.match(html,/href="\/solutions\//);
  assert.match(html,/Illustrated cover for Ocean research/);
  assert.deepEqual(parseRoute(setupLink('test','p1')),{name:'test',id:'test',section:'p1'});
});

test('setup shows practice choices and the selected passage exam duration',()=>{
  const props:any={test:file,mode:'practice',minutes:0,section:'all',onMode:()=>{},onMinutes:()=>{},onSection:()=>{},onStart:()=>{},onClose:()=>{}};
  assert.match(renderToStaticMarkup(React.createElement(TestSetup,props)),/Unlimited/);
  const exam=renderToStaticMarkup(React.createElement(TestSetup,{...props,mode:'exam'}));
  assert.match(exam,/20 minutes/);assert.doesNotMatch(exam,/Time limit/);
});

test('homework worksheet DOCX excludes solution content while answer-only exports omit explanations',async()=>{
  const {window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document:window.document,Node:window.Node});
  const options={includeAnswers:false,includeExplanations:false};
  assert.doesNotMatch(JSON.stringify(readingDocument(file,options)),/SECRET_ANSWER|SECRET_EXPLANATION|Answer key|Answers and explanations/);
  const worksheet=await exportReadingDocument(file,'docx',false,options);
  const xml=await (await JSZip.loadAsync(await worksheet.arrayBuffer())).file('word/document.xml')!.async('string');
  assert.match(xml,/The ocean is vast/);assert.doesNotMatch(xml,/SECRET_ANSWER|SECRET_EXPLANATION/);
  const blocks=readingDocument(file,{includeAnswers:true,includeExplanations:false});
  const table=blocks.at(-1) as any;assert.deepEqual(table.rows,[['Question','Answer'],['1','SECRET_ANSWER']]);
  const pdf=await exportReadingDocument(file,'pdf',false,options);
  assert.equal(new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0,5)),'%PDF-');
});

test('storage inventory sums object sizes without modifying the bucket listing',()=>{
  const files=[{name:'small.png',size:20},{name:'audio.mp3',size:4000},{name:'cover.webp',size:300}];
  const inventory=summarizeFiles(files);assert.equal(inventory.bytes,4320);assert.equal(inventory.count,3);
  assert.equal(inventory.largest[0].name,'audio.mp3');assert.equal(files[0].name,'small.png');
});
