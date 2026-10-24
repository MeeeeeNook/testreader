import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerCatalogRoutes} from '../server/catalogRoutes';
import {testIntroductionPath} from '../src/services/testUrls.js';
import {readFileSync} from 'node:fs';
function fixture(){let route:Function,reads=0,time=1,broken=false;
 const rows=[{id:'public',title:'Public test',status:'published',keys:{1:'PRIVATE'},teacherEmail:'private@example.test'},{id:'draft',title:'Draft',status:'draft'},{id:'gone',title:'Deleted',status:'published',deletedAt:1}];
 registerCatalogRoutes({get:(_path:string,fn:Function)=>{route=fn}} as any,()=>({db:{collection:()=>({where:()=>({get:async()=>{reads++;if(broken)throw Error('Quota exceeded');await Promise.resolve();return {docs:rows.map(item=>({id:item.id,data:()=>item}))};}})})}}),(res:any)=>res.status(503).json({error:'Quota exceeded'}),()=>time);
 const run=async()=>{let code=200,data:any;const headers:any={};const res:any={set:(key:string,value:string)=>{headers[key]=value;return res},status:(value:number)=>{code=value;return res},json:(value:any)=>{data=value}};await route!({},res);return {code,data,headers};};
 return {run,reads:()=>reads,expire:()=>{time+=300001},break:()=>{broken=true}};
}
test('public catalog combines simultaneous loads and shares cached metadata without leaking private or draft fields',async()=>{
 const f=fixture(),results=await Promise.all([f.run(),f.run(),f.run()]);assert.equal(f.reads(),1);assert.deepEqual(results[0].data.tests,[{id:'public',title:'Public test',status:'published'}]);assert.match(results[0].headers['Cache-Control'],/s-maxage=300/);await f.run();assert.equal(f.reads(),1);f.expire();await f.run();assert.equal(f.reads(),2);
});
test('an existing catalog remains readable during quota exhaustion and retries are backed off',async()=>{
 const f=fixture();await f.run();f.expire();f.break();const result=await f.run();assert.equal(result.code,200);assert.equal(result.data.stale,true);assert.equal(result.data.tests[0].id,'public');await f.run();assert.equal(f.reads(),2);
 const fresh=fixture();fresh.break();assert.equal((await fresh.run()).code,503);
});
test('deployments do not require a Firestore migration and unregistered test links remain valid IDs',()=>{
 const scripts=JSON.parse(readFileSync('package.json','utf8')).scripts;assert.doesNotMatch(scripts.build,/test-url-migration/);assert.match(scripts['migrate:test-urls'],/test-url-migration/);
 assert.equal(testIntroductionPath({id:'test_existing',title:'Readable name'}),'/tests/test_existing');assert.equal(testIntroductionPath({id:'test_existing',title:'Readable name',slug:'readable-name'}),'/tests/readable-name');
});
