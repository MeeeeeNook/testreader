import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAssessment, markAssessment } from '../server/assessment.ts';
import { answerMatches, scoreTest } from '../src/services/scoring.ts';

function store() {
  return {
    test: async (id: string) => id === 'missing' ? undefined : {title:'Test',status:id==='draft'?'draft':'published',skill:'reading'},
    sections: async () => [
      {id:'p0',index:0,questions:[{number:1},{number:2}],slots:{s0:{numbers:[1,2],type:'multi'}}},
      {id:'p1',index:1,questions:[{number:3},{number:4,missing:true}],slots:{s1:{numbers:[3],type:'text'}}},
    ],
    keys: async () => ({keys:{1:{answer:'A'},2:{answer:'C'},3:{answer:'word||words'},4:{answer:'should not grade'}}}),
  };
}
test('server marking accepts swapped multi-select order, respects variants and missing source questions', async () => {
  const a=await loadAssessment(store(),{testId:'test'},false);
  const {result,band}=markAssessment(a,{1:'C',2:'A',3:' WORDS ',4:'should not grade'});
  assert.equal(result.correct,3);assert.equal(result.ungraded,1);assert.equal(band,null);
});
test('one selected section keeps its original numbering and excludes all other keys', async () => {
  const a=await loadAssessment(store(),{testId:'test',sectionIds:['p1']},false);
  assert.deepEqual(Object.keys(a.keys),['3','4']);
  assert.throws(()=>markAssessment(a,{1:'A'}),/another test/);
});
test('custom mocks load canonical source keys and renumber in the displayed order', async () => {
  const a=await loadAssessment(store(),{sourceSections:[{testId:'one',sectionId:'p1'},{testId:'two',sectionId:'p0'}]},false);
  assert.equal(a.keys[1].answer,'word||words');assert.equal(a.keys[3].answer,'A');
  assert.equal(markAssessment(a,{1:'words',3:'C',4:'A'}).result.correct,3);
});
test('private/draft tests, invalid sections, and duplicate sources are rejected', async () => {
  await assert.rejects(loadAssessment(store(),{testId:'draft'},false),/unavailable/);
  await assert.rejects(loadAssessment(store(),{testId:'../private'},true),/Invalid/);
  await assert.rejects(loadAssessment(store(),{testId:'test',sectionIds:['gone']},false),/no longer exists/);
  await assert.rejects(loadAssessment(store(),{sourceSections:[{testId:'test',sectionId:'p0'},{testId:'test',sectionId:'p0'}]},false),/distinct/);
});
test('old broken imports cannot be graded as if they were real attempts', async () => {
  const s=store();s.sections=async()=>[{id:'p0',index:0,questions:[{number:1}],slots:{}}] as any;
  await assert.rejects(loadAssessment(s,{testId:'test'},false),/Re-upload/);
});
test('matching labels with middle-dot prefixes accept their displayed letters', () => {
  assert.ok(answerMatches('B',{answer:'B · Person Two',kind:'matching_features'}));
  const result=scoreTest([{numbers:[1,2],keys:{1:{answer:'A'},2:{answer:'C'}},multiGroups:[[1,2]]}],{1:'A',2:'A'});
  assert.equal(result.correct,1);assert.equal(result.incorrect,1);
});
