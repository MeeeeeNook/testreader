import type {AssessmentStore} from './assessment';
import {AssessmentError,loadAssessment,markAssessment} from './assessment';
export async function markFullExam(store:AssessmentStore,request:any){
 if(!request||!request.listening||!request.reading)throw new AssessmentError(400,'Both Listening and Reading answers are required.');
 const output:any={};
 for(const skill of ['listening','reading'] as const){
  const payload=request[skill];
  // Full exams only accept complete published tests, never client-defined keys or parts.
  const assessment=await loadAssessment(store,{testId:payload.testId},false);
  if(assessment.skill!==skill||assessment.parts.length!==(skill==='listening'?4:3)||Object.keys(assessment.keys).length!==40)throw new AssessmentError(400,'Choose a complete 40-question '+skill+' test.');
  output[skill]={...markAssessment(assessment,payload.responses),keys:assessment.keys,transcripts:assessment.transcripts};
 }
 return output;
}
