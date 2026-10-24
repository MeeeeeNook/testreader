import type {TestMeta} from '../types';
export const fullExamLink=(listening:string,reading:string)=>'/full-exam?'+new URLSearchParams({listening,reading});
export const isFullExamTest=(test:TestMeta,skill:'reading'|'listening')=>test.status==='published'&&!test.deletedAt&&test.skill===skill&&test.passages===(skill==='listening'?4:3)&&test.questions===40;
export interface StageSubmission {responses:Record<string|number,string>;elapsedSeconds:number;startedAt:number;completedAt:number}
export interface FullExamDraft {version:1;id:string;listening:string;reading:string;stage:'listening'|'reading'|'results';listeningAnswers?:StageSubmission;readingAnswers?:StageSubmission;results?:any;attemptIds?:string[];testVersions?:Record<string,number>}
export const fullExamStorageKey=(owner:string)=>'ielts:full-exam:v1:'+owner;
export function readFullExamDraft(storage:Pick<Storage,'getItem'>,owner:string):FullExamDraft|null{try{const draft=JSON.parse(storage.getItem(fullExamStorageKey(owner))||'null');return draft?.version===1&&/^[\w-]{1,128}$/.test(draft.id)&&['listening','reading','results'].includes(draft.stage)&&typeof draft.listening==='string'&&typeof draft.reading==='string'?draft:null}catch{return null}}
