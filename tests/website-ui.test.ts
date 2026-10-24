import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerTrashRoutes,managedMedia,unreferencedMedia} from '../server/trashRoutes';
import {registerWebsiteUIRoutes} from '../server/websiteUIRoutes';
import {normalizeWebsiteUI,defaultWebsiteUI} from '../src/services/websiteUI';
import {introductionLink} from '../src/services/shareTest';
import {examMinutes} from '../src/services/sessionSettings';
import {readingDocument} from '../src/services/documentExport';
import {TestSetup} from '../src/components/TestSetup';
import {HomeView} from '../src/components/HomeView';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseHTML} from 'linkedom';
const t:any={schemaVersion:1,id:'listen',title:'A listening test',skill:'listening',source:'Cambridge',duration:30,status:'published',createdAt:1,updatedAt:1,parts:[{id:'p1',title:'Part 1',passageHtml:'<p>PRIVATE TRANSCRIPT</p>',questionHtml:'<p>QUESTION PROMPT</p>',questions:[{number:1,answer:'KEY',explanationHtml:'<p>EXPLANATION</p>'}],slots:{}}]};
test('share links lead to test/part introductions and never carry an active attempt',()=>{
 assert.equal(introductionLink(t),'/tests/a-listening-test');assert.equal(introductionLink({...t,id:'listen_part_0',sourceTestId:'listen',sectionIds:['part 1']}),'/tests/listen/sections/part%201');assert.equal(introductionLink({...t,sourceSections:[{testId:'listen',sectionId:'p1'}]}),'/mock');
 const html=renderToStaticMarkup(React.createElement(TestSetup,{test:{...t,parts:Array(4).fill(t.parts[0])},mode:'exam',minutes:0,section:'all',onMode(){},onMinutes(){},onSection(){},onStart(){},onClose(){}}));
 assert.match(html,/<article class="test-setup test-introduction exam"/);assert.doesNotMatch(html,/<dialog|PRIVATE TRANSCRIPT|QUESTION PROMPT|All tests, answers and downloads/);assert.match(html,/40 minutes/);assert.match(html,/Share test introduction/);
});
test('homepage cards use configured destinations and signed-in users receive their dashboard',()=>{
 const settings=normalizeWebsiteUI({blocks:[{title:'My Listening library',description:'Start here',href:'/full-tests?skill=listening',icon:'listening',visible:true},{visible:false}]});
 const html=renderToStaticMarkup(React.createElement(HomeView,{settings,profile:{id:'member',name:'Student',target:7} as any,attempts:[],tests:[],onNavigate(){},onUpdateProfile:async()=>{}}));
 assert.match(html,/href="\/full-tests\?skill=listening"/);assert.match(html,/My Listening library/);assert.match(html,/Hello, Student/);assert.match(html,/Recent test history/);assert.doesNotMatch(html,/Create your account/);
 assert.equal(normalizeWebsiteUI({blocks:[{href:'//evil.test'}]}).blocks[0].href,'/practice');assert.equal(normalizeWebsiteUI({blocks:[{href:'javascript:alert(1)'}]}).blocks[0].href,'/practice');assert.deepEqual(normalizeWebsiteUI(null),defaultWebsiteUI);
});
test('Listening documents independently include questions, answers, explanations and transcript',()=>{
 const {window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document:window.document,Node:window.Node});
 for(const q of [false,true])for(const a of [false,true])for(const e of [false,true])for(const transcript of [false,true]){
  const value=JSON.stringify(readingDocument(t,{includeQuestions:q,includeAnswers:a,includeExplanations:e,includeTranscript:transcript}));
  assert.equal(value.includes('QUESTION PROMPT'),q);assert.equal(value.includes('PRIVATE TRANSCRIPT'),transcript);assert.equal(value.includes('KEY'),a);assert.equal(value.includes('EXPLANATION'),e);
 }
 assert.equal(examMinutes({...t,parts:Array(4).fill(t.parts[0])}),40);
});
test('managed media cleanup restricts bucket/key scope and protects shared objects',()=>{
 const hash='a'.repeat(64),config={accountId:'0'.repeat(32),accessKeyId:'test',secretAccessKey:'test',bucket:'media',publicUrl:'https://media.example/bucket'};
 const same='https://media.example/bucket/audio/'+hash+'.mp3',image='https://media.example/bucket/images/'+hash+'.png';
 const target=managedMedia({audio:same,transcript:'<img src="'+image+'">',outside:['https://media.example/other/audio/'+hash+'.mp3','https://evil.example/bucket/audio/'+hash+'.mp3','https://media.example/bucket/audio/not-a-hash.mp3']},config,'firebase');
 assert.equal(target.size,2);assert.deepEqual(unreferencedMedia(target,managedMedia({audio:same},config,'firebase')),['r2:images/'+hash+'.png']);
});
function trashFixture(admin=true,active=false,broken=false){
 const routes=new Map<string,Function>(),removed:string[]=[],deleted:string[]=[],docs=new Map<string,any>();
 const audio=(name:string)=>'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/'+encodeURIComponent('media/audio/'+name)+ '?alt=media&token=test';
 docs.set('tests/gone',{deletedAt:active?null:1,audioFiles:[{url:audio('unique.mp3')},{url:audio('shared.mp3')}]});docs.set('tests/retained',{deletedAt:2,status:'draft'});
 docs.set('tests/gone/sections/p1',{audio:audio('unique.mp3')});docs.set('tests/retained/sections/p1',{audio:audio('shared.mp3')});
 docs.set('test_keys/gone',{transcripts:{p1:'<img src="'+audio('transcript.png')+'">'}});docs.set('test_keys/retained',{transcripts:{p1:'<img src="'+audio('transcript.png')+'">'}});
 const snap=(path:string):any=>({id:path.split('/').at(-1),ref:{path},exists:docs.has(path),data:()=>docs.get(path)});
 const db:any={doc:(path:string)=>({path,get:async()=>snap(path),delete:async()=>{deleted.push(path);docs.delete(path)}}),collection:(name:string)=>({get:async()=>({docs:[...docs.keys()].filter(p=>p.startsWith(name+'/')&&p.split('/').length===2).map(snap)})}),collectionGroup:()=>({get:async()=>({docs:[...docs.keys()].filter(p=>p.includes('/sections/')).map(snap)})}),recursiveDelete:async(ref:any)=>{deleted.push(ref.path);for(const key of docs.keys())if(key===ref.path||key.startsWith(ref.path+'/'))docs.delete(key)},runTransaction:async(fn:Function)=>fn({get:(ref:any)=>ref.get(),set:(ref:any,data:any)=>docs.set(ref.path,data),delete:(ref:any)=>docs.delete(ref.path)})};
 const bucket={name:'test-bucket',file:(key:string)=>({delete:async()=>{if(broken)throw Error('Storage failed');removed.push(key)}})};
 registerTrashRoutes({post:(p:string,h:Function)=>routes.set(p,h)} as any,async()=>({isAdmin:admin}),()=>({db,bucket}),(res,e:any)=>res.status(e.status||503).json({error:e.message}));
 const run=async(body:any)=>{let status=200,data:any;const res:any={status:(s:number)=>{status=s;return res},json:(d:any)=>{data=d}};await routes.get('/api/admin/trash-delete')!({body},res);return {status,data}};
 return {run,removed,deleted,docs};
}
test('permanent deletion requires administrator, Trash membership and explicit confirmation',async()=>{
 const no=trashFixture(false);assert.equal((await no.run({testId:'gone',confirm:'DELETE'})).status,403);assert.equal(no.removed.length,0);
 const active=trashFixture(true,true);assert.equal((await active.run({testId:'gone',confirm:'DELETE'})).status,409);assert.equal(active.deleted.length,0);
 const f=trashFixture();assert.equal((await f.run({testId:'gone'})).status,400);assert.equal((await f.run({testId:'../gone',confirm:'DELETE'})).status,400);assert.equal(f.removed.length,0);
});
test('Empty Trash removes unused media and keys, retains other trashed/draft references, and retries safely',async()=>{
 const f=trashFixture(),result=await f.run({testId:'gone',confirm:'DELETE'});assert.equal(result.status,200);assert.deepEqual(f.removed,['media/audio/unique.mp3']);assert.equal(result.data.retainedSharedMedia,2);assert.ok(f.deleted.includes('test_keys/gone'));assert.ok(f.deleted.includes('tests/gone'));assert.ok(f.docs.has('tests/retained'));assert.equal(f.docs.has('site_settings/trash_cleanup'),false);
 assert.equal((await f.run({testId:'gone',confirm:'DELETE'})).status,200);
 const batch=trashFixture(),both=await batch.run({testIds:['gone','retained'],confirm:'DELETE'});assert.equal(both.status,200);assert.deepEqual(new Set(batch.removed),new Set(['media/audio/unique.mp3','media/audio/shared.mp3','media/audio/transcript.png']));assert.equal(batch.docs.has('tests/retained'),false);assert.equal(both.data.deletedTestIds.length,2);
 const failed=trashFixture(true,false,true);assert.equal((await failed.run({testId:'gone',confirm:'DELETE'})).status,503);assert.equal(failed.deleted.length,0);assert.ok(failed.docs.has('tests/gone'));assert.equal(failed.docs.has('site_settings/trash_cleanup'),false);
});
test('Website UI has a public normalized read and only the administrator can save',async()=>{
 const routes=new Map<string,Function>(),writes:any[]=[];let admin=false;
 registerWebsiteUIRoutes({get:(p:string,h:Function)=>routes.set(p,h),post:(p:string,h:Function)=>routes.set(p,h)} as any,async()=>({isAdmin:admin}),()=>({db:{doc:()=>({get:async()=>({data:()=>undefined}),set:async(s:any)=>writes.push(s)})}}),(res,e:any)=>res.status(e.status||503).json({error:e.message}));
 const run=async(path:string,body:any={})=>{let status=200,data:any;const res:any={status:(s:number)=>{status=s;return res},set:()=>res,json:(d:any)=>{data=d}};await routes.get(path)!({body},res);return {status,data}};
 assert.deepEqual((await run('/api/website-ui')).data,defaultWebsiteUI);assert.equal((await run('/api/admin/website-ui')).status,403);assert.equal(writes.length,0);admin=true;assert.equal((await run('/api/admin/website-ui',{heroTitle:'My test library'})).status,200);assert.equal(writes[0].heroTitle,'My test library');
});
