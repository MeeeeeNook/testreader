import type {EditableTest} from '../types';
export function createTestLaunch(test:EditableTest,mode:'practice'|'exam',minutes:number,session:string){
 const safe={...test,parts:test.parts.map(part=>({...part,passageHtml:test.skill==='listening'?'':part.passageHtml,questions:part.questions.map(question=>({...question,answer:'',explanationHtml:'',referenceQuote:''}))}))};
 return {path:`/tests/${encodeURIComponent(test.sourceTestId||test.id)}/take/${encodeURIComponent(session)}`,snapshot:{test:safe,mode,minutes}};
}
