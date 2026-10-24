import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerTeacherRoutes,teacherAccess} from '../server/teacherRoutes';
import {questionTypesForSkill} from '../src/services/portal';
function fixture(owner=false){
 const routes=new Map<string,Function>(),records=new Map<string,any>();let queries=0;
 const identity:any={uid:owner?'owner':'teacher',email:owner?'manhcuong2006ht@gmail.com':'teacher@example.test',email_verified:true};
 const db:any={doc:(path:string)=>({get:async()=>({data:()=>records.get(path)}),set:async(v:any)=>records.set(path,v)}),collection:(name:string)=>({get:async()=>{queries++;return {docs:name==='teachers'?[...records].filter(([k])=>k.startsWith('teachers/')).map(([k,v])=>({id:k.split('/')[1],data:()=>v})):[{id:'test',data:()=>({title:'Test',skill:'listening',secret:'NO',passageHtml:'PRIVATE'})}]}},limit(){return this}})};
 registerTeacherRoutes({post:(p:string,h:Function)=>routes.set(p,h)} as any,async()=>({isAdmin:owner,identity,db}),()=>({auth:{getUserByEmail:async(email:string)=>({uid:'teacher',email,disabled:false})}}),(res:any,e:any)=>res.status(e.status||503).json({error:e.message}));
 const run=async(path:string,body:any={})=>{let status=200,data:any;const res:any={status:(s:number)=>{status=s;return res},json:(d:any)=>{data=d}};await routes.get(path)!({body},res);return {status,data}};
 return {run,records,identity,db,get queries(){return queries}};
}
test('only verified owner may authorize or revoke teachers; authorization is stored outside editable profiles',async()=>{
 const no=fixture();assert.equal((await no.run('/api/admin/teachers/set',{email:'teacher@example.test',active:true})).status,403);assert.equal(no.records.size,0);
 const f=fixture(true);assert.equal((await f.run('/api/admin/teachers/set',{email:'teacher@example.test',active:true})).status,200);assert.equal(f.records.get('teachers/teacher').active,true);assert.equal(f.records.get('teachers/teacher').authorizedBy,'owner');
 f.identity.email_verified=false;assert.equal((await f.run('/api/admin/teachers/set',{email:'teacher@example.test',active:false})).status,403);f.identity.email_verified=true;
 await f.run('/api/admin/teachers/set',{email:'teacher@example.test',active:false});assert.equal(f.records.get('teachers/teacher').active,false);
});
test('teacher read endpoints recheck access and reject revoked/unverified/email-mismatched identities without exposing private keys',async()=>{
 const f=fixture();assert.equal((await f.run('/api/teacher/admin-view')).status,403);assert.equal(f.queries,0);
 f.records.set('teachers/teacher',{email:f.identity.email,active:true});const result=await f.run('/api/teacher/admin-view');assert.equal(result.status,200);assert.equal(result.data.tests[0].title,'Test');assert.doesNotMatch(JSON.stringify(result.data),/PRIVATE|secret/);
 f.records.get('teachers/teacher').active=false;assert.equal((await f.run('/api/teacher/admin-view')).status,403);
 f.records.get('teachers/teacher').active=true;f.identity.email_verified=false;assert.equal(await teacherAccess(f.db,f.identity),false);f.identity.email_verified=true;f.identity.email='different@test.test';assert.equal(await teacherAccess(f.db,f.identity),false);
});
test('Listening filters contain Listening formats and exclude Reading-only formats',()=>{
 const types=questionTypesForSkill('listening');assert.deepEqual(types.map(t=>t[0]),['multiple_choice','matching_features','diagram','sentence','summary','short_answer']);assert.doesNotMatch(JSON.stringify(types),/Headings|Matching Information|TRUE-FALSE|YES-NO/);assert.match(JSON.stringify(questionTypesForSkill('reading')),/Headings|TRUE-FALSE/);
});
