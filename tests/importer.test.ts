import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { toEditable, cleanLayout, jsonParts } from '../src/services/importer.ts';

const { window } = parseHTML('<html><body></body></html>');
Object.assign(globalThis, { document: window.document, Node: window.Node });
const feedback = (n: number, answer: string) => `<div class="result-explain"><div class="true-answer"><span class="answer">Answer: ${answer}</span><button class="btn-explain" data-number="${n}">Explain</button></div><div class="collapse-explain" id="collapse-explain-${n}"><p>SECRET EXPLANATION ${n}</p></div></div>`;
const choice = (letter: string, correct = false) => `<div class="form-check"><input value="${letter}" ${correct ? 'is-value="1"' : ''}><span class="number-alphabet">${letter}</span><span class="label">Option ${letter}</span></div>`;

test('source widgets become typed, blank answer slots and private feedback stays out of layouts', () => {
  const model = toEditable({ parts: [{ topic_content: '<h2>Passage</h2><p>Ordinary passage.</p>', questions: [1,2,3,4,5,6], question_content:
    `<div class="question true_false" question-number="1"><span class="name">Statement</span><input value="TRUE" is-value="1">${feedback(1,'TRUE')}</div>` +
    `<p>A word: <span class="question fill_blank" question-number="2"><input value="secret"></span>${feedback(2,'word')}</p>` +
    `<div class="question multiple_choice_one" question-number="3"><span class="name">Choose one</span>${choice('A')}${choice('B',true)}</div>` +
    `<h3>Questions 4-5</h3><div class="question multiple_choice_many"><span class="name">Choose two</span>${choice('A',true)}${choice('B')}${choice('C',true)}${feedback(4,'A')}${feedback(5,'C')}</div>` +
    '<p>Another blank: {CAU_6}</p><script>alert(1)</script>' }] });
  const p = model.parts[0];
  const slots = Object.values(p.slots);
  assert.deepEqual(slots.map(s => s.type), ['select','text','radio','multi','text']);
  assert.deepEqual(slots.find(s => s.type === 'multi')?.numbers, [4,5]);
  assert.equal(p.questions.find(q => q.number === 3)?.answer, 'B');
  assert.equal(p.questions.find(q => q.number === 1)?.kind, 'true_false');
  assert.match(p.questions[0].explanationHtml!, /SECRET EXPLANATION/);
  assert.doesNotMatch(p.questionHtml + p.passageHtml, /SECRET|Answer:|<input|<script|is-value|\{CAU/);
  const layout = document.createElement('div'); layout.innerHTML = p.questionHtml + p.passageHtml;
  assert.equal(layout.querySelectorAll('[data-slot]').length, slots.length);
  for (const q of p.questions) assert.ok(slots.some(s => s.numbers.includes(q.number)) || q.missing);
});

test('heading choices stay beside the paragraph, matching banks retain selectable letters', () => {
  const model = toEditable({parts:[{topic_content: '<h2>Title</h2><div class="question" question-number="1"><input></div><p>Paragraph text</p>', questions:[1,2], question_content:
    '<div class="answer matching_info" id="answer-1"><div class="answer-item">i First heading</div><div class="answer-item">ii Second heading</div></div>' +
    '<div class="answer" id="answer-2"><div class="answer-item">Person One</div><div class="answer-item">Person Two</div></div>' +
    '<span class="question matching_features" question-number="2"><input></span>' + feedback(1,'ii') + feedback(2,'Person Two')}]});
  const p = model.parts[0];
  assert.match(p.passageHtml, /data-slot/);
  const heading = Object.values(p.slots).find(s => s.numbers[0]===1)!;
  assert.deepEqual(heading.options.map(o=>o.value), ['i','ii']);
  assert.equal(p.questions.find(q=>q.number===1)?.kind,'heading');
  assert.match(p.questions.find(q=>q.number===2)!.answer,/^B/);
});

test('keys without source questions and range placeholders remain ungradable', () => {
  const p = toEditable({parts:[{topic_content:'<h2>Title</h2>',questions:[1,2,3],question_content:'{CAU_1_2}'+feedback(3,'lost')}]}).parts[0];
  assert.ok(p.questions.every(q=>q.missing));
  assert.equal(Object.keys(p.slots).length,0);
});

test('sanitization preserves only slot identifiers, safe diagrams, and text', () => {
  const cleaned = cleanLayout('<p onclick="evil()">Prompt <span data-slot="s0"></span></p><div class="result-explain">SECRET</div><img src="javascript:evil()"><script>evil()</script>');
  assert.match(cleaned,/data-slot="s0"/);
  assert.doesNotMatch(cleaned,/SECRET|onclick|src="javascript:|<script/);
});

test('parts extraction parses JSON without executing source code', () => {
  assert.equal(jsonParts('throw new Error("not executed"); const parts = [{"topic_content":"[text]","question_content":"{CAU_1}"}];')[0].topic_content,'[text]');
  assert.throws(()=>jsonParts('const parts = [window.alert("do not execute")];'));
});

test('HTML embedded inside an exported input value cannot swallow the following correct choice', () => {
  const p = toEditable({parts:[{topic_content:'<h2>Title</h2>',question_content:
    `<div class="question multiple_choice_one" question-number="1"><span class="name">Choose one</span>
    <div class="form-check"><span class="number-alphabet">C</span><input
      name='q1'
      value='an idea <span class='title'><span class='title'>about the world.</span></span>'
    ><span class="label">An idea about the world</span></div>
    <div class="form-check"><span class="number-alphabet">D</span><input
      name='q1'
      value='maintaining children's confidence'
      is-value
    ><span class="label">Maintaining children's confidence</span></div>${feedback(1,'D')}</div>`}]}).parts[0];
  const slot=Object.values(p.slots)[0];
  assert.deepEqual(slot.options.map(o=>o.value),['C','D']);
  assert.equal(slot.options[1].label,"Maintaining children's confidence");
  assert.equal(p.questions[0].answer,'D');
});

test('a following multi-choice group starts after passage heading question numbers',()=>{
  const p=toEditable({parts:[{topic_content:'<div class="question" question-number="14"><input></div><div class="question" question-number="15"><input></div>',questions:[14,15,16,17],question_content:
    '<div class="answer matching_info" id="answer-14-15"><div class="answer-item">i. Heading</div></div>' +
    `<div class="question multiple_choice_many"><span class="name">Choose two</span>${choice('A',true)}${choice('C',true)}${feedback(16,'A')}${feedback(17,'C')}</div>`}]}).parts[0];
  assert.deepEqual(Object.values(p.slots).find(s=>s.type==='multi')?.numbers,[16,17]);
  for(const n of [14,15,16,17])assert.equal(Object.values(p.slots).filter(s=>s.numbers.includes(n)).length,1);
});

test('duplicate source placeholders do not create a second control or erase an existing question',()=>{
  const p=toEditable({parts:[{topic_content:'<h2>Title</h2>',question_content:
    '<span class="question fill_blank" question-number="1"><input></span><p>Repeated marker {CAU_1}</p><p>{CAU_1_2}</p>'}]}).parts[0];
  assert.equal(Object.values(p.slots).filter(s=>s.numbers.includes(1)).length,1);
  assert.equal(p.questions.find(q=>q.number===1)?.missing,false);
  assert.equal(p.questions.find(q=>q.number===2)?.missing,true);
});
