import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { compareTests, inFolder, folderChildren, folderPath, planFolderMove } from '../src/services/catalog.ts';
import { passageTitle } from '../src/services/passageTitle.ts';
import { toEditable } from '../src/services/importer.ts';
import { scoreTest, estimatedBand } from '../src/services/scoring.ts';
import type { TestMeta } from '../src/types.ts';
const {window} = parseHTML('<html><body></body></html>');
Object.assign(globalThis, {document: window.document, Node: window.Node});
const meta = (id: string, source: string, extra: Partial<TestMeta> = {}): TestMeta => ({id, source, title:'Test '+id, skill:'reading', access:'free', status:'published', duration:60, questions:40, passages:3, updatedAt:99, ...extra});
test('folder paths preserve boundaries, browse children, and do not include similarly named siblings', () => {
  const tests = [meta('1','Forecast/2026/Q3'), meta('2','Forecast / 2026 / Q4'),meta('3','Forecast / 2025'),meta('4','Forecast2 / Q3')];
  assert.equal(folderPath(' Forecast\\2026 / Q3 '), 'Forecast / 2026 / Q3');
  assert.ok(inFolder(tests[0].source, 'Forecast / 2026'));
  assert.equal(inFolder(tests[0].source, 'Forecast / 2026', false), false);
  assert.equal(inFolder(tests[3].source, 'Forecast'), false);
  assert.deepEqual(folderChildren(tests, 'Forecast'), [['Forecast / 2025',1],['Forecast / 2026',2]]);
});
test('catalog sorts added and updated dates separately and handles natural test numbers', () => {
  const tests=[meta('10','Folder',{createdAt:2,updatedAt:1}),meta('2','Folder',{createdAt:1,updatedAt:9})];
  assert.equal([...tests].sort((a,b)=>compareTests(a,b,'new'))[0].id,'10');
  assert.equal([...tests].sort((a,b)=>compareTests(a,b,'updated'))[0].id,'2');
  assert.equal([...tests].sort((a,b)=>compareTests(a,b,'title'))[0].id,'2');
  assert.equal([...tests].sort((a,b)=>compareTests(a,b,'title-desc'))[0].id,'10');
});
test('a generic passage heading gives way to the actual title without losing paragraph answer slots', () => {
  const html='<h2>PASSAGE 1</h2><p>Read the text and answer questions 1–13</p><p style="text-align:center">Australia’s Airborne Dentists</p><p>Ordinary body.</p>';
  assert.equal(passageTitle(html,'PASSAGE 1'), 'Australia’s Airborne Dentists');
  assert.equal(passageTitle(html,'Custom title'), 'Custom title');
  const test = toEditable({title:'File 1', parts:[{topic_content:html+'<div class="question" question-number="1"><input></div>',question_content:'',questions:[1]}]});
  assert.equal(test.parts[0].title, 'Australia’s Airborne Dentists');
  assert.equal(test.title, 'Australia’s Airborne Dentists');
  assert.match(test.parts[0].passageHtml,/data-slot=/);
  assert.doesNotMatch(test.parts[0].passageHtml,/IELTSSLOT/);
});
test('complete Academic Reading submissions convert raw marks to band; partial and missing-key results do not', () => {
  const numbers=Array.from({length:40},(_,i)=>i+1);
  const keys=Object.fromEntries(numbers.map(n=>[n,{answer:'yes'}]));
  for(const [correct, band] of [[0,0],[15,5],[23,6],[30,7],[33,7.5],[35,8],[37,8.5],[39,9],[40,9]]) {
    const responses=Object.fromEntries(numbers.slice(0,correct).map(n=>[n,'yes']));
    assert.equal(estimatedBand(scoreTest([{numbers,keys}],responses)),band,`${correct}/40`);
  }
  assert.equal(estimatedBand(scoreTest([{numbers:numbers.slice(0,13),keys}],{})),null);
  assert.equal(estimatedBand(scoreTest([{numbers,keys,missing:[40]}],{})),null);
});

test('renaming a folder preserves descendants and excludes similarly named folders and Trash', () => {
  const tests=[meta('1','Forecast / Q3'),meta('2','Forecast / Q3 / Week 1'),meta('3','Forecast / Q30'),meta('4','Forecast / Q3',{deletedAt:1})];
  assert.deepEqual([...planFolderMove(tests,'Forecast/Q3','Archive/2026/Q3')], [['Archive / 2026 / Q3',['1']],['Archive / 2026 / Q3 / Week 1',['2']]]);
  assert.throws(()=>planFolderMove(tests,'Forecast',' / '), /destination/);
});


test('legacy names are repaired from plain paragraph titles, without treating instructions as titles', async () => {
 const {isGenericPassageTitle}=await import('../src/services/passageTitle.ts');
 const {needsCatalogRepair}=await import('../src/services/catalogRepair.ts');
 for(const title of ['Passage 1','READING PASSAGE 2','Passage / Part 3','Section IV','']) assert.ok(isGenericPassageTitle(title),title);
 assert.equal(passageTitle('<p>READING PASSAGE 2</p><p>You should spend 20 minutes on Questions 14–26.</p><p>The future of cities</p><p>Urban life is changing.</p>','Passage 2'),'The future of cities');
 assert.ok(needsCatalogRepair(meta('1','Forecast')));
 assert.equal(needsCatalogRepair(meta('1','Forecast',{passages:1,sectionSummaries:[{id:'p0',index:0,title:'The future of cities',questions:13,kinds:[]}]})),false);
});

test('content audit finds duplicate numbering, missing keys and missing response controls',async()=>{
 const {auditTest}=await import('../src/services/testAudit.ts');
 const item=toEditable({title:'Source',parts:[{topic_content:'<h2>The future of cities</h2><p>A passage.</p>',question_content:'',questions:[1]}]});
 item.parts[0].slots={};item.parts[0].questions=[{number:1,kind:'text',answer:''},{number:1,kind:'text',answer:'yes'}];
 const issues=auditTest(item).join(' ');
 assert.match(issues,/duplicate number/);assert.match(issues,/answer key is empty/);assert.match(issues,/answer control is missing/);
});
