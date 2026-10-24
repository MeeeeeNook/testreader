import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHistoryRoutes} from '../server/historyRoutes';
import {gradeSigner} from '../server/gradeSignature';
import {syncHistoryRecords,saveAttempt,readAttempts} from '../src/services/localHistory.js';
import {loadAssessment} from '../server/assessment';
import {readFileSync} from 'node:fs';
const signer=gradeSigner('test-only-not-a-real-key');
function fixture(admin=false){
 const routes=new Map<string,Function>(),records=new Map<string,any>();let allowed=true,status='published',deletedAt:any=null;
 const doc=(path:string)=>({path,get:async()=>({exists:records.has(path),data:()=>records.get(path)})});
 const db:any={doc,collection:(path:string)=>({doc:(id:string)=>doc(path+'/'+id)}),runTransaction:async(fn:Function)=>fn({get:(ref:any)=>ref.get(),set:(ref:any,data:any)=>records.set(ref.path,structuredClone(data))})};
 const store:any={test:async()=>({title:'Trusted title',skill:'reading',status,deletedAt}),keys:async()=>({keys:{1:{answer:'correct'}}}),sections:async()=>[{id:'p1',questions:[{number:1}],slots:{s1:{numbers:[1],type:'text'}}}]};
 registerHistoryRoutes({post:(path:string,fn:Function)=>routes.set(path,fn)} as any,async()=>{if(!allowed)throw Object.assign(new Error('Sign in'),{status:401});return {identity:{uid:'student'},isAdmin:admin,db};},()=>store,(res:any,e:any)=>res.status(e.status||503).json({error:e.message}),()=>signer);
 const run=async(path:string,body:any)=>{let code=200,data:any;const res:any={status:(n:number)=>{code=n;return res;},json:(d:any)=>{data=d;}};await routes.get(path)!({body},res);return {code,data};};
 return {records,run,store,setAllowed:(value:boolean)=>allowed=value,setStatus:(value:string)=>status=value,setDeleted:()=>deletedAt=1};
}
const body={id:'attempt-1',testId:'test-1',mode:'practice',owner:'victim',testTitle:'Forged title',band:9,result:{correct:40},responses:{1:'wrong'}};
test('history saves derive owner, title, score and signature on the server; planted verification flags are not trusted',async()=>{
 const f=fixture();f.records.set('users/student/attempts/attempt-1',{...body,serverVerified:true,gradeSignature:'0'.repeat(64)});
 const saved=await f.run('/api/history/save',body);assert.equal(saved.code,200);const record=saved.data.attempt;
 assert.equal(record.owner,'student');assert.equal(record.testTitle,'Trusted title');assert.equal(record.result.correct,0);assert.equal(record.band,null);assert.equal(record.serverVerified,true);assert.equal(signer.verify(record),true);
 const retried=await f.run('/api/history/save',{...body,responses:{1:'correct'}});assert.deepEqual(retried.data.attempt,record,'verified attempts are immutable');
 assert.equal(f.records.has('users/victim/attempts/attempt-1'),false);
});
test('history rejects unauthenticated, malformed, deleted/draft sources and forged answers',async()=>{
 const f=fixture();f.setAllowed(false);assert.equal((await f.run('/api/history/save',body)).code,401);assert.equal(f.records.size,0);f.setAllowed(true);
 assert.equal((await f.run('/api/history/save',{...body,id:'../../owner'})).code,400);
 assert.equal((await f.run('/api/history/save',{...body,responses:{2:'correct'}})).code,400);
 f.setStatus('draft');assert.equal((await f.run('/api/history/save',body)).code,404);f.setStatus('published');f.setDeleted();assert.equal((await f.run('/api/history/save',body)).code,404);
});
test('administrator history reads verify signatures rather than accepting a stored boolean',async()=>{
 const no=fixture();assert.equal((await no.run('/api/admin/student-attempts',{targetUserId:'student'})).code,403);
 const f=fixture(true);f.records.set('users/student/attempts/old',{id:'old',serverVerified:true,gradeSignature:'f'.repeat(64),result:{correct:40}});
 assert.equal((await f.run('/api/admin/student-attempts',{targetUserId:'student',id:'old'})).data.attempt.serverVerified,false);
 const saved=await f.run('/api/history/save',body);assert.equal((await f.run('/api/admin/student-attempts',{targetUserId:'student',id:body.id})).data.attempt.serverVerified,true);
 assert.equal(signer.verify({...saved.data.attempt,band:9}),false);
 const reordered=Object.fromEntries(Object.entries(saved.data.attempt).reverse());assert.equal(signer.verify(reordered),true,'Firestore map order does not affect signatures');
});
test('history applies a persistent per-account write limit',async()=>{
 const f=fixture();f.records.set('api_limits/history_student',{count:30,until:Date.now()+60000});assert.equal((await f.run('/api/history/save',body)).code,429);assert.equal(f.records.has('users/student/attempts/attempt-1'),false);
});
test('history sync replaces client grades with canonical records and retains unavailable sessions without blocking newer results',async()=>{
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 const original:any={...body,owner:'student',createdAt:1,result:{rows:[],correct:40}};saveAttempt(storage,'student',original);saveAttempt(storage,'student',{...original,id:'attempt-2',createdAt:2});
 await syncHistoryRecords(storage,'student',{list:async()=>[],put:async(record:any)=>{if(record.id==='attempt-1')throw Object.assign(new Error('Unavailable'),{status:404});return {...record,result:{rows:[],correct:0},band:null,serverVerified:true};}});
 const records=readAttempts(storage,'student');assert.equal(records.find((r:any)=>r.id==='attempt-1').syncBlocked,true);assert.equal(records.find((r:any)=>r.id==='attempt-2').result.correct,0);assert.equal(records.length,2);
});
test('retired AI dictionary cannot create provider charges and server token checks include revocation',()=>{
 const source=readFileSync('server/app.ts','utf8');assert.doesNotMatch(source,/new GoogleGenAI|generateContent/);assert.match(source,/AI_DICTIONARY_RETIRED/);assert.match(source,/verifyIdToken\(value, true\)/);
});
