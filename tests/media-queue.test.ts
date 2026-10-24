import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runMediaQueue,mediaQueueProgress,type QueueResult} from '../src/services/mediaQueue';
const jobs=Array.from({length:8},(_,i)=>({name:'part-'+i+'.mp3',url:'blob:'+i,digest:'digest'+i,audio:true,blob:new Blob(['original'])}));
const delay=()=>new Promise<void>(r=>setTimeout(r,5));
test('queue bounds active jobs, overlaps compression with uploads and reports every file',async()=>{
 let compress=0,upload=0,maxCompress=0,maxUpload=0,overlap=false;const rows:any[]=[];
 const result=await runMediaQueue(jobs,{compressionConcurrency:3,uploadConcurrency:3,onProgress:r=>rows.push(r),compress:async(j,p)=>{compress++;maxCompress=Math.max(compress,maxCompress);if(upload)overlap=true;p(50);await delay();compress--;return {blob:j.blob,name:j.name}},upload:async(j,b,n,p)=>{upload++;maxUpload=Math.max(upload,maxUpload);if(compress)overlap=true;p(50);await delay();upload--;return 'https://media/'+n}});
 assert.equal(result.results.size,8);assert.equal(result.failures.size,0);assert.ok(overlap);assert.equal(maxCompress,3);assert.ok(maxUpload<=3);assert.ok(rows.at(-1).every((r:any)=>r.phase==='complete'&&r.percent===100));
});
test('duplicate recordings share one task; failed files do not stop unrelated jobs; successful files are reused on retry',async()=>{
 const cache=new Map<string,QueueResult>();let encoded=0,uploads=0;const batch=[jobs[0],{...jobs[0],url:'duplicate'},jobs[1],jobs[2]];
 const options={compressionConcurrency:1,uploadConcurrency:2,cache,onProgress:()=>{},delay:async()=>{},compress:async(j:any)=>{encoded++;return {blob:j.blob,name:j.name}},upload:async(j:any)=>{uploads++;if(j.url===jobs[1].url)throw Error('HTTP 403');return 'https://media/'+j.name}};
 const result=await runMediaQueue(batch,options);assert.equal(encoded,3);assert.equal(uploads,3);assert.equal(result.results.size,3);assert.equal(result.failures.size,1);assert.equal(cache.size,3);
 const again=await runMediaQueue(batch,{...options,upload:async j=>{uploads++;return 'https://media/'+j.name}});assert.equal(encoded,4);assert.equal(uploads,4);assert.equal(again.results.size,4);
});
test('transient upload failure retries without encoding again and progress remains monotonic',async()=>{
 let compressed=0,attempts=0;const progress:number[]=[];
 const result=await runMediaQueue([jobs[0]],{compressionConcurrency:2,uploadConcurrency:3,onProgress:r=>progress.push(r[0].percent),delay:async()=>{},compress:async j=>{compressed++;return {blob:j.blob,name:j.name}},upload:async(j,b,n,p)=>{p(80);if(++attempts===1)throw Error('Network interrupted');return 'https://media/file'}});
 assert.equal(compressed,1);assert.equal(attempts,2);assert.equal(result.results.size,1);assert.ok(progress.every((p,i)=>!i||p>=progress[i-1]));
});

test('overall queue progress uses a 5–85 percent media budget, not 100 times the file percentages',()=>{assert.equal(mediaQueueProgress([]),5);assert.equal(mediaQueueProgress([{percent:0}]),5);assert.equal(mediaQueueProgress([{percent:20}]),21);assert.equal(mediaQueueProgress([{percent:100},{percent:0}]),45);assert.equal(mediaQueueProgress([{percent:100},{percent:100}]),85);assert.equal(mediaQueueProgress([{percent:999},{percent:NaN}]),45)});
