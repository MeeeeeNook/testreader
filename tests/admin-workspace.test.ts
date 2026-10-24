import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {csvText,studentDirectory,adminSearch} from '../src/services/adminTools';
import {AdminSidebar} from '../src/components/AdminSidebar';
import {AdminDashboard} from '../src/components/AdminDashboard';
import {AdminView} from '../src/components/AdminView';
import type {TestMeta,UserProfile} from '../src/types';
const meta:TestMeta={id:'one',title:'Reading sample',skill:'reading',source:'',status:'published',access:'free',questions:40,passages:3,duration:60,updatedAt:1};
const learner=(id:string,extra:Partial<UserProfile>={}):UserProfile=>({id,name:id,email:id+'@example.test',target:7,status:'active',language:'en',theme:'light',fontSize:18,favorites:[],...extra});
const props={tests:[meta,{...meta,id:'listen',title:'Listening sample',skill:'listening' as const,status:'draft' as const}],reports:[],learners:[],adminUid:'owner',onUploadFiles:async()=>{},onNewTest:()=>{},onEditTest:()=>{},onExportTest:()=>{},onArchiveToggle:()=>{},onExportBank:()=>{},onOpenUpload:()=>{},onToggleReportStatus:async()=>{},onToggleLearnerStatus:async()=>{},onNotify:()=>{},onDeleteTest:async()=>{},onRestoreTest:async()=>{},onSetCollection:async()=>{},onSetStatus:async()=>{},onViewStudents:()=>{}};

test('CSV exports preserve quotes, Unicode and newlines while neutralizing spreadsheet formulas',()=>{
 const csv=csvText([['Title','Value'],['Tiếng Việt, "A"','=SUM(A1)'],['line\nbreak','  +command'],['@formula','-12']]);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.includes('"Tiếng Việt, ""A"""'));
 assert.ok(csv.includes("\"'=SUM(A1)\""));
 assert.ok(csv.includes("\"'  +command\""));
 assert.ok(csv.includes('"line\nbreak"'));
});

test('student filters combine search, status, upcoming exams and sort without mutating records',()=>{
 const learners=[learner('Zoe',{createdAt:1,examDate:'2026-10-26'}),learner('Amy',{createdAt:3,status:'suspended',examDate:'2026-11-02'}),learner('Ben',{createdAt:2,examDate:'2026-12-01'}),learner('gone',{deletedAt:1})];
 assert.deepEqual(studentDirectory(learners,'','','name').map(l=>l.id),['Amy','Ben','Zoe']);
 assert.deepEqual(studentDirectory(learners,' example.test ','active','newest').map(l=>l.id),['Ben','Zoe']);
 assert.deepEqual(studentDirectory(learners,'','','newest',true,new Date('2026-10-25T12:00:00').getTime()).map(l=>l.id),['Amy','Zoe']);
 assert.equal(learners[0].id,'Zoe');
});

test('global search excludes deleted records, encodes IDs and returns both tests and people',()=>{
 const result=adminSearch([{...meta,id:'a/b'},{...meta,id:'gone',deletedAt:1}],[learner('reader',{name:'Reading student'}),learner('gone',{name:'Reading',deletedAt:1})],'Reading');
 assert.equal(result.length,2);assert.equal(result[0].href,'/admin/tests/a%2Fb');
 assert.equal(adminSearch([meta],[],' ').length,0);
});

test('dashboard links open correct filters; test library includes both skills by default',()=>{
 const dashboard=renderToStaticMarkup(React.createElement(AdminDashboard,{tests:props.tests,learners:[],reports:[],onNavigate:()=>{},onReview:()=>{}}));
 assert.ok(dashboard.includes("href=\"/admin/tests?status=draft\""));
 assert.ok(dashboard.includes("href=\"/admin/tests?status=published\""));
 const all=renderToStaticMarkup(React.createElement(AdminView,props));assert.match(all,/Reading sample/);assert.match(all,/Listening sample/);
 const drafts=renderToStaticMarkup(React.createElement(AdminView,{...props,location:'/admin/tests?status=draft'}));
 assert.match(drafts,/Listening sample/);assert.doesNotMatch(drafts,/Reading sample/);
});

test('quick find opens from keyboard, keeps native navigation and closes after route change',async()=>{
 const {window}=parseHTML('<html><body><div id="app"></div></body></html>');
 Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('app')!);const nav:string[]=[];
 try{
 await act(async()=>root.render(React.createElement(AdminSidebar,{location:'/admin',tests:props.tests,onNavigate:p=>nav.push(p)})));
 const key=new window.Event('keydown',{bubbles:true});Object.assign(key,{ctrlKey:true,key:'k'});
 await act(async()=>window.dispatchEvent(key));
 assert.ok(document.querySelector('dialog[open]'));
 const mobile=document.querySelector('[aria-controls="admin-navigation"]')!;
 await act(async()=>mobile.dispatchEvent(new window.Event('click',{bubbles:true})));
 assert.equal(mobile.getAttribute('aria-expanded'),'true');
 await act(async()=>root.render(React.createElement(AdminSidebar,{location:'/admin/tests',onNavigate:p=>nav.push(p)})));
 assert.equal(document.querySelector('dialog'),null);
 assert.equal(document.querySelector('[aria-current="page"]')?.getAttribute('href'),'/admin/tests');
 }finally{await act(async()=>root.unmount())}
});

test('library quick filters reset pagination and selecting a draft never displays published rows',async()=>{
 const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('app')!);
 try{
 const tests=Array.from({length:25},(_,i)=>({...meta,id:String(i),title:'Test '+i,status:i<3?'draft' as const:'published' as const}));
 await act(async()=>root.render(React.createElement(AdminView,{...props,tests})));
 await act(async()=>document.querySelector('[aria-label="Last page"]')!.dispatchEvent(new window.Event('click',{bubbles:true})));
 assert.equal(document.querySelectorAll('tbody tr').length,5);
 const drafts=[...document.querySelectorAll('button')].find(b=>b.textContent==='Drafts')!;
 await act(async()=>drafts.dispatchEvent(new window.Event('click',{bubbles:true})));
 assert.equal(document.querySelectorAll('tbody tr').length,3);
 assert.equal(document.querySelector('[aria-label="Previous page"]')!.hasAttribute('disabled'),true);
 assert.ok([...document.querySelectorAll('tbody .admin-status')].every(n=>n.textContent==='draft'));
 }finally{await act(async()=>root.unmount())}
});
