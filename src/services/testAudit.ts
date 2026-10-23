import type {EditableTest,TestMeta} from '../types';
import {isGenericPassageTitle} from './passageTitle';
import {needsCatalogRepair} from './catalogRepair';
export function catalogIssues(test:TestMeta):string[] {
 const issues:string[]=[];
 if(!test.questions)issues.push('No questions');
 if(needsCatalogRepair(test))issues.push('Passage titles need repair');
 if(test.duration<=0)issues.push('Invalid duration');
 return issues;
}
export function auditTest(test:EditableTest) {
 const issues:string[]=[], seen=new Set<number>();
 if(!test.title.trim())issues.push('Enter a test title.');
 if(!test.parts.length)issues.push('Add at least one passage or section.');
 for(const [i,p] of test.parts.entries()) {
  if(test.skill==='reading'&&isGenericPassageTitle(p.title))issues.push(`Part ${i+1}: enter the actual passage title.`);
  if(test.skill==='reading'&&!p.passageHtml.replace(/<[^>]*>/g,'').trim())issues.push(`Part ${i+1}: passage content is empty.`);
  if(test.skill==='listening'&&p.audioEnd&&p.audioEnd<=(p.audioStart||0))issues.push(`Part ${i+1}: end time must be after the start time.`);
   if(test.skill==='listening'&&!p.audio)issues.push(`Part ${i+1}: listening audio is missing.`);
  for(const q of p.questions) {
   if(seen.has(q.number))issues.push(`Question ${q.number}: duplicate number.`);seen.add(q.number);
   if(!q.answer?.trim()&&!q.missing)issues.push(`Question ${q.number}: answer key is empty.`);
   if(!q.missing&&!Object.values(p.slots||{}).some(s=>s.numbers.includes(q.number)))issues.push(`Question ${q.number}: answer control is missing.`);
  }
 }
 return issues;
}
