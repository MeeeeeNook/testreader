import {collectFiles,importJsonTests,jsonParts,toEditable,extractTitle} from './importer';
import type {EditableTest} from '../types';
export interface ImportCandidate {test:EditableTest;name:string}
export interface ImportPlan {candidates:ImportCandidate[];images:{name:string;url:string;blob:Blob}[];errors:string[]}
// Parsing is entirely local: this function never writes tests or uploads media.
export async function prepareImport(files:File[]):Promise<ImportPlan> {
 const plan:ImportPlan={candidates:[],images:[],errors:[]};
 try {
  const parsed=await collectFiles(files.filter(f=>!/\.json$/i.test(f.name)));
  plan.images=parsed.images;plan.errors.push(...parsed.errors);
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
     plan.candidates.push({test:toEditable({title:extractTitle(c.source,c.name),parts:jsonParts(c.source)},{source},assets),name:c.name});
    }
   }catch(e){plan.errors.push(`${c.name}: ${e instanceof Error?e.message:String(e)}`);}
  }
  return plan;
 }catch(e){disposeImport(plan);throw e;}
}
export function disposeImport(plan:ImportPlan){plan.images.forEach(i=>URL.revokeObjectURL(i.url));}
export function replaceImportAssets(test:EditableTest,assets:Map<string,string>):EditableTest {
 // Include image references in explanations and option labels, not only passage HTML.
 return JSON.parse(JSON.stringify(test,(_key,value)=>{
  if(typeof value!=='string')return value;
  for(const [from,to]of assets)value=value.split(from).join(to);
  return value;
 }));
}
