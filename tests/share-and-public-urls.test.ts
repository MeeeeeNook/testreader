import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {humanTestSlug,testIntroductionPath,visibleTestSource} from '../src/services/testUrls.js';
import {ensureTestUrl,resolvePublicTest} from '../server/testUrlRegistry.mjs';
import {renderTestIntroduction,registerTestPageRoutes} from '../server/testPages';
import {shortDictionaryExample,vocabularyExample,vocabularyFromMeaning} from '../src/services/dictionary';
import {shareTest} from '../src/services/shareTest';
import {readFileSync} from 'node:fs';
function store(){const records=new Map<string,any>();const ref=(path:string)=>({path,id:path.split('/').at(-1),get:async()=>({id:path.split('/').at(-1),exists:records.has(path),data:()=>records.get(path)})});const db:any={doc:ref,runTransaction:async(fn:any)=>fn({get:(doc:any)=>doc.get(),set:(doc:any,data:any)=>records.set(doc.path,structuredClone(data)),update:(doc:any,data:any)=>records.set(doc.path,{...records.get(doc.path),...data})})};return {db,records};}
const meta:any={id:'test_abc',title:'Forecast Reading Quý 2 - Test 2',slug:'forecast-reading-quy-2-test-2',skill:'reading',source:'Forecast Q2',status:'published',questions:40,duration:60,passages:3,sectionSummaries:[{id:'p1',title:'Ocean research',index:0,questions:13}]};
test('readable paths normalize Vietnamese, keep saved slugs and do not show IDs as sources',()=>{
 assert.equal(humanTestSlug(meta.title),meta.slug);assert.equal(humanTestSlug('Đề nghe số 1'),'de-nghe-so-1');
 assert.equal(testIntroductionPath(meta),'/tests/'+meta.slug);assert.equal(testIntroductionPath({...meta,title:'New title'}),testIntroductionPath(meta));
 assert.equal(visibleTestSource('test_abc-def-123'),'');assert.equal(visibleTestSource('Forecast Q2'),'Forecast Q2');
});
test('slug registry resolves title collisions, survives renames, and preserves legacy ID links',async()=>{
 const f=store();f.records.set('tests/test_abc',meta);f.records.set('tests/other',{...meta,id:'other',slug:undefined});
 const first=await ensureTestUrl(f.db,'test_abc',meta.title),second=await ensureTestUrl(f.db,'other',meta.title);
 assert.equal(first,meta.slug);assert.notEqual(second,first);assert.match(second,/forecast-reading-quy-2-test-2-/);
 assert.equal(await ensureTestUrl(f.db,'test_abc','Completely renamed'),first);
 assert.equal((await resolvePublicTest(f.db,first))?.id,'test_abc');assert.equal((await resolvePublicTest(f.db,'test_abc'))?.id,'test_abc');
 f.records.set('tests/test_abc',{...meta,status:'draft'});assert.equal(await resolvePublicTest(f.db,first),null);assert.equal((await resolvePublicTest(f.db,first,true))?.id,'test_abc');
 f.records.set('tests/test_abc',{...meta,deletedAt:1});assert.equal(await resolvePublicTest(f.db,first),null);assert.equal(await resolvePublicTest(f.db,'../users/owner'),null);
});
test('introduction HTML contains crawlable metadata and content, boots the real app and escapes script payloads',()=>{
 const template='<!doctype html><html><head><title>Old</title><meta name="description" content="Old"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
 const html=renderTestIntroduction(template,{...meta,title:'Forecast </script><img src=x onerror=alert(1)>'},meta.slug);
 assert.match(html,/rel="canonical" href="https:\/\/ielts.vungocmanhcuong.id.vn\/tests\/forecast-reading-quy-2-test-2"/);assert.match(html,/<h1>Forecast &lt;\/script&gt;/);assert.match(html,/40 questions/);assert.match(html,/Ocean research/);assert.match(html,/application\/ld\+json/);assert.match(html,/src="\/assets\/app.js"/);
 const {document}=parseHTML(html);assert.equal(document.querySelectorAll('title').length,1);assert.ok(JSON.parse(document.querySelector('[type="application/ld+json"]')!.textContent!).name.includes('</script>'));
 assert.doesNotMatch(html,/<img src=x|<\/script><img/);assert.match(html,/window.__TEST_ROUTE__/);
});
test('public URL lookup and legacy redirects work without login; draft intros and URL writes stay protected',async()=>{
 const f=store(),routes=new Map<string,Function>();f.records.set('tests/test_abc',meta);f.records.set('test_urls/'+meta.slug,{testId:meta.id});
 const app:any={post:(path:string,fn:Function)=>routes.set('POST '+path,fn),get:(path:string,fn:Function)=>routes.set('GET '+path,fn)};
 registerTestPageRoutes(app,{caller:async()=>({isAdmin:false,db:f.db}),optionalCaller:async()=>{throw Error('Public access must not need sign in');},backend:()=>({db:f.db}),apiError:(res:any,e:any)=>res.status(e.status||503).json({error:e.message})});
 const run=async(key:string,req:any)=>{let code=200,data:any,redirect:any;const res:any={status:(n:number)=>{code=n;return res},set:()=>res,type:()=>res,send:(v:any)=>{data=v},json:(v:any)=>{data=v},redirect:(n:number,path:string)=>{code=n;redirect=path}};await routes.get(key)!({headers:{},...req},res);return {code,data,redirect};};
 assert.equal((await run('POST /api/test-route',{body:{reference:meta.slug}})).data.testId,meta.id);
 assert.equal((await run('POST /api/admin/test-url',{body:{id:'new',title:'New test'}})).code,403);
 const old=await run('GET /tests/:reference',{params:{reference:meta.id},path:'/tests/'+meta.id,originalUrl:'/tests/'+meta.id+'?mode=exam'});assert.equal(old.code,308);assert.equal(old.redirect,'/tests/'+meta.slug+'?mode=exam');
 f.records.set('tests/test_abc',{...meta,status:'draft'});assert.equal((await run('GET /tests/:reference',{params:{reference:meta.id},path:'/tests/'+meta.id})).code,404);
});
test('sharing copies a canonical link and never invokes the OS share sheet',async()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldWindow=(globalThis as any).window;let shared=0,copied='';
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{share:async()=>{shared++},clipboard:{writeText:async(value:string)=>{copied=value}}}});(globalThis as any).window={location:{hostname:'admin.ielts.vungocmanhcuong.id.vn',origin:'https://admin.ielts.vungocmanhcuong.id.vn'}};
 try{assert.equal(await shareTest('/tests/'+meta.slug,meta.title),'Link copied');assert.equal(copied,'https://ielts.vungocmanhcuong.id.vn/tests/'+meta.slug);assert.equal(shared,0);}finally{if(prior)Object.defineProperty(globalThis,'navigator',prior);else delete(globalThis as any).navigator;(globalThis as any).window=oldWindow;}
});
test('dictionary examples are short, sourced, and never replaced with passage context',()=>{
 assert.equal(shortDictionaryExample('x '.repeat(30)),'');assert.equal(shortDictionaryExample('She read the book.'),'She read the book.');
 assert.equal(vocabularyFromMeaning({word:'book',results:[]},{definition:'A written work.'},'A giant unrelated passage.').example,'');
 assert.equal(vocabularyExample({example:'Old unrelated paragraph.'}),'');assert.equal(vocabularyExample({example:'She read the book.',exampleSource:'dictionary'}),'She read the book.');
});
test('header has six destinations in the requested order and full-exam grading accepts optional identity',()=>{
 const header=readFileSync('src/components/PortalHeader.tsx','utf8');const labels=['Listening</a>','Reading</a>','Mini Test</a>','Full Test</a>','Test history</a>','Vocabulary</a>'];let at=-1;for(const label of labels){const next=header.indexOf(label);assert.ok(next>at,label);at=next;}
 const server=readFileSync('server/app.ts','utf8');assert.match(server,/full-exam\/submit[\s\S]{0,100}optionalCaller/);
});
