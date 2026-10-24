import type { EditableTest, TestMeta } from '../types';
export const questionTypes = [
 ['heading','Matching Headings'],['matching_info','Matching Information'],['multiple_choice','Multiple Choice'],
 ['diagram','Plan, map, diagram labelling'],['sentence','Sentence Completion'],['summary','Summary, form completion'],
 ['true_false','TRUE–FALSE–NOT GIVEN'],['yes_no','YES–NO–NOT GIVEN'],['matching_features','Matching Features'],
] as const;
export const listeningQuestionTypes=[['multiple_choice','Multiple Choice'],['matching_features','Matching'],['diagram','Plan, map, diagram labelling'],['sentence','Sentence Completion'],['summary','Form, note, table, flow-chart, summary completion'],['short_answer','Short-answer questions']] as const;
export const questionTypesForSkill=(skill:string)=>skill==='listening'?listeningQuestionTypes:questionTypes;
export function questionFamily(kind: string) {
 if (/short.?answer/i.test(kind)) return 'short_answer';
 if (/heading/i.test(kind)) return 'heading';
 if (/multiple_choice/i.test(kind)) return 'multiple_choice';
 if (/matching_info/i.test(kind)) return 'matching_info';
 if (/map|plan|diagram|label/i.test(kind)) return 'diagram';
 if (/sentence/i.test(kind)) return 'sentence';
 if (/yes_no/i.test(kind)) return 'yes_no';
 if (/true_false/i.test(kind)) return 'true_false';
 if (/fill_blank|summary|form|note|table/i.test(kind)) return 'summary';
 return 'matching_features';
}
export function sectionSummaries(test: EditableTest) {
 return test.parts.map((p,index)=>{
  const kinds=new Set(p.questions.map(q=>questionFamily(q.kind)));
  const instructions=p.questionHtml.replace(/<[^>]*>/g,' ');
  if (/answer\s+(?:the\s+)?(?:following\s+)?questions/i.test(instructions)&&test.skill==='listening')kinds.add('short_answer');
  if (/complete[\s\S]{0,60}sentences/i.test(instructions)) kinds.add('sentence');
  if (/label[\s\S]{0,50}(?:diagram|map|plan)/i.test(instructions)) kinds.add('diagram');
  return {id:p.id || `p${index}`,index:p.position ? p.position-1 : index,title:p.title,questions:p.questions.length,kinds:[...kinds]};
 });
}
export function catalogSections(test: TestMeta) {
 return test.sectionSummaries || Array.from({length:test.passages},(_,index)=>({id:`p${index}`,index,title:test.passageTitles?.[index] || `${test.skill==='reading'?'Passage':'Part'} ${index+1}`,questions:0,kinds:[] as string[]}));
}
export function countsAsAttempt(uid: string | null | undefined, manual: boolean, total: number, responses: Record<string, string>, numbers: number[]) {
 return Boolean(uid && uid !== 'guest' && manual && total > 0 && numbers.filter(n=>String(responses[n] || '').trim()).length >= Math.ceil(total / 2));
}
export const slugify = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100) || 'reading';
export const answerPath = (id:string, sectionId:string, title:string) => `/answers/${encodeURIComponent(id)}/${encodeURIComponent(sectionId)}/${slugify(title)}`;
export function matchesSource(source: string, category: string) {
 return !category || category==='all' || (category==='cambridge' ? /cambridge|\bcam(?:\b|\d|_)/i : category==='forecast' ? /forecast|weekly|qu[yý]|quarter/i : /\bvol(?:\b|\d|_)|real.?exam/i).test(source);
}
