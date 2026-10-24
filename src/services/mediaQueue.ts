import type {ImportMedia} from './importPreview';
export interface QueueRow {id:string;name:string;phase:'queued'|'compressing'|'uploading'|'complete'|'failed';percent:number;attempt:number;error?:string}
export function mediaQueueProgress(rows:Pick<QueueRow,'percent'>[]){return 5+.8*rows.reduce((sum,row)=>sum+Math.max(0,Math.min(100,Number.isFinite(row.percent)?row.percent:0)),0)/Math.max(1,rows.length)}
export interface QueueResult {url:string;name:string;size:number}
interface Job extends ImportMedia {audio:boolean;digest:string}
export function limiter(limit:number){let active=0;const waiting:(()=>void)[]=[];return async<T>(task:()=>Promise<T>):Promise<T>=>{await new Promise<void>(resolve=>{const start=()=>{active++;resolve()};if(active<limit)start();else waiting.push(start)});try{return await task()}finally{active--;waiting.shift()?.()}}}
/** Bound complete jobs too: decoded PCM and pending compressed blobs cannot pile up. */
export async function runMediaQueue(jobs:Job[],options:{compressionConcurrency:number;uploadConcurrency:number;cache?:Map<string,QueueResult>;compress:(job:Job,progress:(p:number)=>void)=>Promise<{blob:Blob;name:string}>;upload:(job:Job,blob:Blob,name:string,progress:(p:number)=>void)=>Promise<string>;onProgress:(rows:QueueRow[])=>void;delay?:(ms:number)=>Promise<void>}){
 const compress=limiter(Math.max(1,Math.min(2,options.compressionConcurrency))),upload=limiter(Math.max(1,Math.min(3,options.uploadConcurrency)));
 const rows:QueueRow[]=jobs.map(j=>({id:j.url,name:j.name,phase:'queued',percent:0,attempt:0})),results=new Map<string,QueueResult>(),failures=new Map<string,string>(),shared=new Map<string,Promise<QueueResult>>();
 const emit=()=>options.onProgress(rows.map(r=>({...r})));emit();let cursor=0;
 const worker=async()=>{while(cursor<jobs.length){const index=cursor++,job=jobs[index],row=rows[index];
  const update=(phase:QueueRow['phase'],percent:number)=>{row.phase=phase;row.percent=Math.max(row.percent,Math.min(100,percent));emit()};
  try{
   const cached=options.cache?.get(job.url);if(cached){results.set(job.url,cached);update('complete',100);continue}
   const key=(job.audio?'audio:':'image:')+job.digest;let task=shared.get(key);
   if(!task){task=(async()=>{let blob=job.blob,name=job.name;
    if(job.audio){const encoded=await compress(async()=>{update('compressing',0);return options.compress(job,p=>update('compressing',p*.45))});blob=encoded.blob;name=encoded.name}
    const url=await upload(async()=>{for(let attempt=1;;attempt++){row.attempt=attempt;update('uploading',job.audio?45:0);try{return await options.upload(job,blob,name,p=>update('uploading',(job.audio?45:0)+(job.audio?.55:1)*p))}catch(e){if(attempt>=2||/unauthorized|unauthenticated|access.denied|HTTP[_ ]?4\d\d|configuration|CORS|PUBLIC_ACCESS/i.test((e as Error).message))throw e;await(options.delay?options.delay(500):new Promise(r=>setTimeout(r,500)))}}});
    return {url,name,size:blob.size};})();shared.set(key,task)}
   const value=await task;const result={...value,name:job.name.replace(/\.[^.]+$/,'')+'.'+value.name.split('.').pop()};results.set(job.url,result);options.cache?.set(job.url,result);update('complete',100);
  }catch(e){row.error=(e as Error).message||String(e);failures.set(job.url,row.error);update('failed',100)}
 }};
 await Promise.all(Array.from({length:Math.min(3,jobs.length)},worker));return {results,failures};
}
