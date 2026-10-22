import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {reconcileLibrary,folderLocation,folderOptions,changeFolder,trashFolders,menuFoldersForTest,fullTestMenu,organizationPatch} from '../src/services/folders';
import {FolderManager,FolderMenuSettings} from '../src/components/FolderManager';
import {PracticeCatalog} from '../src/components/PracticeCatalog';
const meta=(id:string,folderPath='',extra:any={})=>({id,folderPath,title:'Test '+id,source:'Random zip / filename',status:'published',skill:'reading',passages:3,questions:40,duration:60,access:'free',updatedAt:1,...extra} as any);
test('missing registry is reconstructed from explicit saved paths, with stable nested folders and accurate membership',()=>{
 const records=[meta('a','Cambridge Ielts / Cam 16',{folderId:'legacy-cam'}),meta('b','Cambridge Ielts / Cam 16'),meta('c','Forecast Q3'),meta('d')];
 const one=reconcileLibrary([],records),again=reconcileLibrary([],records.slice().reverse());
 assert.equal(folderOptions(one.folders).length,3);
 for(const t of one.tests)assert.equal(t.folderId,again.tests.find(x=>x.id===t.id)?.folderId);
 assert.equal(one.tests[0].folderId,'legacy-cam');assert.equal(one.tests[1].folderId,'legacy-cam');
 assert.equal(folderLocation(one.tests[1].folderId,one.folders),'Cambridge Ielts / Cam 16');
 assert.equal(one.tests[3].folderId,undefined);assert.ok(!folderOptions(one.folders).some(f=>f.path.includes('Random zip')));
 assert.ok(one.folders.every(f=>f.showInFullTestMenu===false));
 const restored=reconcileLibrary(one.folders,one.tests);assert.deepEqual(restored,one);
});
test('saved IDs win over stale paths after rename, and deleted folders are never recreated',()=>{
 const old=changeFolder(changeFolder([],'parent','Cambridge',null),'child','Cam 16','parent');
 const renamed=changeFolder(old,'parent','Renamed',null),record=meta('a','Cambridge / Cam 16',{folderId:'child'});
 const result=reconcileLibrary(renamed,[record]);assert.equal(result.folders.length,2);assert.equal(result.tests[0].folderPath,'Renamed / Cam 16');
 const deleted=reconcileLibrary(trashFolders(old,['parent','child']),[record]);assert.equal(deleted.folders.length,2);assert.equal(deleted.tests[0].folderPath,'');assert.equal(deleted.tests[0].folderId,'child');assert.deepEqual(organizationPatch(deleted.tests[0],deleted.folders).fullTestMenuFolders,[]);
});
test('public menu includes only chosen folders and descendants, excludes drafts, archived, deleted and single passages',()=>{
 let folders=changeFolder(changeFolder(changeFolder([],'parent','Cambridge',null),'child','Cam 16','parent'),'other','Forecast',null);
 folders=folders.map(f=>({...f,showInFullTestMenu:f.id==='parent'}));
 const records=[meta('a','Cambridge / Cam 16',{folderId:'child'}),meta('b','Forecast',{folderId:'other'}),meta('draft','Cambridge',{folderId:'parent',status:'draft'}),meta('gone','Cambridge',{folderId:'parent',deletedAt:5}),meta('single','Cambridge',{folderId:'parent',passages:1})].map(t=>({...t,...organizationPatch(t,folders)}));
 assert.deepEqual(fullTestMenu(records).folders,[{id:'parent',path:'Cambridge',count:1}]);assert.equal(fullTestMenu(records).full.length,2);
 assert.deepEqual(fullTestMenu([meta('legacy','Not chosen')]).folders,[]);
 assert.deepEqual(menuFoldersForTest({folderId:'other'},folders),[]);
 const rename=changeFolder(folders,'parent','New name',null);assert.equal(rename.find(f=>f.id==='parent')?.showInFullTestMenu,true);assert.deepEqual(menuFoldersForTest({folderId:'child'},rename),[{id:'parent',path:'New name'}]);
 const moved=changeFolder(folders,'child','Cam 16','other');assert.deepEqual(menuFoldersForTest({folderId:'child'},moved),[]);
});
function environment(){const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});return window;}
test('admin recovery displays folders and correct test counts instead of an empty library',async()=>{
 environment();const records=[meta('a','Forecast Q3'),meta('b','Forecast Q3')],resolved=reconcileLibrary([],records),root=createRoot(document.getElementById('app')!);
 try{await act(async()=>root.render(React.createElement(FolderManager,{...resolved,value:'',onOpen:()=>{},onDelete:async()=>{}})));assert.ok(document.querySelector('[aria-label="Select folder Forecast Q3"]'));assert.doesNotMatch(document.body.textContent!,/Create your first folder|Unfiled \(2\)/);assert.match(document.body.textContent!,/2 tests/);}finally{await act(async()=>root.unmount());}
});
test('menu selection is staged, saves only selected folders, reports errors and can retry',async()=>{
 const window=environment(),folders=changeFolder(changeFolder([],'a','Cambridge',null),'b','Forecast',null),writes:any[]=[],root=createRoot(document.getElementById('app')!);let reject=false;
 try{await act(async()=>root.render(React.createElement(FolderMenuSettings,{folders,tests:[meta('a','Cambridge',{folderId:'a'})],onSave:async next=>{if(reject)throw new Error('Connection lost');writes.push(next);}})));
 const input=document.querySelector<HTMLInputElement>('[aria-label="Show Cambridge in Full Test menu"]')!;
 await act(async()=>{input.checked=true;input.dispatchEvent(new window.Event('click',{bubbles:true}));});assert.equal(writes.length,0);
 const save=[...document.querySelectorAll('button')].find(b=>b.textContent==='Save menu')!;
 await act(async()=>save.click());assert.equal(writes[0].find((f:any)=>f.id==='a').showInFullTestMenu,true);assert.equal(writes[0].find((f:any)=>f.id==='b').showInFullTestMenu,false);assert.match(document.querySelector('[role="status"]')!.textContent!,/saved/);
 reject=true;await act(async()=>save.click());assert.match(document.querySelector('[role="alert"]')!.textContent!,/Connection lost/);assert.equal(save.disabled,false);
 reject=false;await act(async()=>save.click());assert.equal(writes.length,2);assert.equal(document.querySelector('[role="alert"]'),null);
 const clear=[...document.querySelectorAll('button')].find(b=>b.textContent==='Clear selection')!;await act(async()=>clear.click());await act(async()=>save.click());assert.ok(writes[2].every((f:any)=>!f.showInFullTestMenu));
 }finally{await act(async()=>root.unmount());}
});
test('parent menu link filters the actual full-test catalog to descendant tests',async()=>{
 environment();const root=createRoot(document.getElementById('app')!),profile:any={id:'guest',name:'Learner',language:'en',favorites:[]};try{await act(async()=>root.render(React.createElement(PracticeCatalog,{tests:[meta('child','',{source:'Cambridge / Cam 16'}),meta('other','',{source:'Forecast'})],profile,attempts:[],full:true,location:'/full-tests?source=Cambridge',onNavigate:()=>{}})));const titles=[...document.querySelectorAll('.practice-card h2')].map(el=>el.textContent);assert.deepEqual(titles,['Test child']);}finally{await act(async()=>root.unmount());}
});
