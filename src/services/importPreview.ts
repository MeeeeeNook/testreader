import {contentHash,mediaDigests,newImportIdentity} from "./importIdentity";
import {collectFiles,importJsonTests,jsonParts,toEditable,extractTitle} from './importer';
import type {EditableTest} from '../types';
import {assignImportedAudio,audioReferences,isListeningSource} from './listening';
export interface ImportCandidate {test:EditableTest;name:string;match?:{title:string;folder:string}}
export interface ImportMedia {name:string;url:string;blob:Blob;archive?:string}
export interface ImportPlan {candidates:ImportCandidate[];images:ImportMedia[];recordings?:ImportMedia[];errors:string[]}
// Parsing is entirely local: this function never writes tests or uploads media.
export async function prepareImport(files:File[]):Promise<ImportPlan> {
 const plan:ImportPlan={candidates:[],images:[],recordings:[],errors:[]};
 try {
  const parsed=await collectFiles(files.filter(f=>!/\.json$/i.test(f.name)));
  plan.images=parsed.images;plan.recordings=parsed.recordings;plan.errors.push(...parsed.errors);
  const assets=Object.fromEntries(plan.images.map(i=>[i.name,i.url]));
  for(const file of files.filter(f=>/\.json$/i.test(f.name))) {
   try {plan.candidates.push(...importJsonTests(await file.text(),file.name,assets).map(test=>({test,name:file.name})));}
   catch(e){plan.errors.push(`${file.name}: ${e instanceof Error?e.message:String(e)}`);}
  }
  for(const c of parsed.candidates) {
   try {
    if(/\.json$/i.test(c.name))plan.candidates.push(...importJsonTests(c.source,c.name,assets).map(test=>({test,name:c.name})));
    else {
     const segments=c.name.split('/');
     const source=segments.length>1?segments.slice(0,-1).filter(s=>!/\.zip$/i.test(s)).join(' / ')||segments[0].replace(/\.zip$/i,''):'Imported collection';
     const scopedImages=Object.fromEntries(plan.images.filter(m=>!m.archive||m.archive===c.archive).map(m=>[m.name,m.url]));
     const listening=isListeningSource(c.source),title=extractTitle(c.source,c.name);
     let test=toEditable({title,parts:jsonParts(c.source)},{source,skill:listening?'listening':'reading'},scopedImages);
     if(listening){
       test={...test,title,parts:test.parts.map((part,index)=>{const numbers=part.questions.map(q=>q.number);const position=numbers.length?Math.floor((Math.min(...numbers)-1)/10)+1:part.position||index+1;return {...part,position,title:`Part ${position}`}})};
       const recordings=(plan.recordings||[]).filter(m=>!m.archive||m.archive===c.archive).map((m,i)=>({id:'recording-'+i,name:m.name,url:m.url,size:m.blob.size}));
       test=assignImportedAudio(test,recordings,audioReferences(c.source));
     }
     plan.candidates.push({test,name:c.name});
    }
   }catch(e){plan.errors.push(`${c.name}: ${e instanceof Error?e.message:String(e)}`);}
  }
  plan.candidates.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  const media=await mediaDigests([...plan.images,...(plan.recordings||[])]);
  for(const candidate of plan.candidates)candidate.test=newImportIdentity(candidate.test,await contentHash(candidate.test,media));
  return plan;
 }catch(e){disposeImport(plan);throw e;}
}
export function disposeImport(plan:ImportPlan){[...plan.images,...(plan.recordings||[])].forEach(i=>URL.revokeObjectURL(i.url));}
export function replaceImportAssets(test:EditableTest,assets:Map<string,string>):EditableTest {
 // Include image references in explanations and option labels, not only passage HTML.
 return JSON.parse(JSON.stringify(test,(_key,value)=>{
  if(typeof value!=='string')return value;
  for(const [from,to]of assets)value=value.split(from).join(to);
  return value;
 }));
}

