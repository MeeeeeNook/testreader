import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerPortalRoutes} from '../server/portalRoutes.ts';
import {AssessmentError} from '../server/assessment.ts';
function setup({isAdmin=false,guest=false,published=true}: {isAdmin?:boolean;guest?:boolean;published?:boolean}={}) {
 const routes=new Map<string,any>(), records=new Map<string,any>([
 ['tests/t',{id:'t',title:'A test',source:'Forecast',skill:'reading',access:'premium',status:published?'published':'draft',sectionSummaries:[{id:'p0',title:'Airborne Dentists'}]}],
 ['test_keys/t',{keys:{1:{answer:'TRUE',explanationHtml:'<p>Explanation</p>'}}}],
 ['contributions/c',{id:'c',owner:'student',status:'pending',content:'[]'}],
 ]);
 const snap=(path:string)=>({exists:records.has(path),id:path.split('/').at(-1),data:()=>records.get(path)});
 const db:any={doc:(path:string)=>({path,get:async()=>snap(path),update:async(data:any)=>records.set(path,{...records.get(path),...data}),delete:async()=>records.delete(path)}),collection:(path:string)=>({get:async()=>({docs:path==='tests/t/sections'?[{id:'p0',data:()=>({title:'Airborne Dentists',index:0,passageHtml:'<p>Reading passage</p>',questions:[{number:1}],questionHtml:'<p>Question</p>'})}]:[]})}),runTransaction:async(fn:any)=>fn({get:async(ref:any)=>snap(ref.path),update:(ref:any,data:any)=>records.set(ref.path,{...records.get(ref.path),...data}),set:()=>{throw new Error('All tests are free; no access grants may be created.');}})};
 const app:any={post:(path:string,handler:any)=>routes.set('POST '+path,handler),get:(path:string,handler:any)=>routes.set('GET '+path,handler)};
 registerPortalRoutes(app,{caller:async()=>{if(guest)throw new AssessmentError(401,'Sign in');return {db,isAdmin,identity:{uid:'owner',email:'owner@example.test'}};},backend:()=>({db}),apiError:(res:any,e:any)=>res.status(e.status||503).json({error:e.message})});
 const call=async(key:string,body:any={},params:any={})=>{const response:any={statusCode:200,headers:{},status(n:number){this.statusCode=n;return this;},set(k:string,v:string){this.headers[k]=v;return this;},type(value:string){this.contentType=value;return this;},json(value:any){this.body=value;return this;},send(value:any){this.body=value;return this;}};await routes.get(key)({body,params,path:'/answers/t/p0/airborne-dentists'},response);return response;};
 return {call,records};
}
test('only the verified administrator identity may manage articles or review contributed documents',async()=>{
 const {call}=setup();
 for(const route of ['/api/admin/contributions','/api/admin/contributions/review','/api/admin/articles/list','/api/admin/articles/save','/api/admin/articles/delete'])assert.equal((await call('POST '+route)).statusCode,403,route);
});
test('guest contributions are rejected before any content is stored',async()=>{
 const {call,records}=setup({guest:true});const before=records.size;assert.equal((await call('POST /api/contributions/create')).statusCode,401);assert.equal(records.size,before);
});
test('contribution review changes only its review status and never creates premium entitlements',async()=>{
 const {call,records}=setup({isAdmin:true});assert.equal((await call('POST /api/admin/contributions/review',{id:'c',decision:'approved'})).statusCode,200);assert.equal(records.get('contributions/c').status,'approved');assert.equal(records.size,3);assert.equal((await call('POST /api/admin/contributions/review',{id:'c',decision:'approved'})).statusCode,409);
});
test('published answer landings remain free and never fetch or reveal private keys',async()=>{
 const {call}=setup();const result=await call('GET /answers/:testId/:sectionId/:slug',{}, {testId:'t',sectionId:'p0',slug:'airborne-dentists'});assert.equal(result.statusCode,200);assert.match(result.body,/Airborne Dentists Reading Answers/);assert.doesNotMatch(result.body,/Answer: TRUE|Explanation/);assert.match(result.body,/rel="canonical" href="\/answers\/t\/p0\/airborne-dentists"/);
});
test('draft tests do not expose their solutions publicly',async()=>{
 const {call}=setup({published:false});const result=await call('GET /answers/:testId/:sectionId/:slug',{}, {testId:'t',sectionId:'p0',slug:'title'});assert.equal(result.statusCode,404);assert.doesNotMatch(result.body,/Answer: TRUE/);
});
