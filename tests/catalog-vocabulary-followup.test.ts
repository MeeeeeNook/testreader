import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {FolderPage} from '../src/components/FolderPage';
import {VocabularyView} from '../src/components/VocabularyView';
import {reconcileLibrary,changeFolder,organizationPatch,folderLink} from '../src/services/folders';
import {parseRoute} from '../src/services/browserHistory.js';
import {lookupVocabulary} from '../src/services/dictionary';
function environment(){const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});return window;}
const profile:any={id:'learner',name:'Learner',language:'en',favorites:[]};
const meta=(id:string,folderId:string,folderPath:string)=>({id,title:'Test '+id,source:folderPath,folderId,folderPath,skill:'reading',status:'published',passages:3,questions:40,duration:60,updatedAt:1,createdAt:1} as any);
test('public folder links recover existing menu IDs, survive renames and publish descriptions without private profiles',()=>{
 const old=meta('one','child','Cambridge / Cam 16');old.fullTestMenuFolders=[{id:'parent',path:'Cambridge'}];
 const recovered=reconcileLibrary([],[old]);assert.ok(recovered.folders.some(folder=>folder.id==='parent'));
 let folders:import('../src/services/folders').LibraryFolder[]=changeFolder(changeFolder([],'parent','Cambridge',null),'child','Cam 16','parent').map(folder=>({...folder,description:folder.id==='parent'?'Official preparation collection.':'Reading practice for this book.'}));
 const patch=organizationPatch(old,folders),guest=reconcileLibrary([],[{...old,...patch}]);
 assert.equal(guest.folders.find(folder=>folder.id==='parent')?.description,'Official preparation collection.');
 assert.equal(guest.folders.find(folder=>folder.id==='child')?.parentId,'parent');
 folders=changeFolder(folders,'parent','New name',null);assert.equal(folderLink('parent'),'/folders/parent');assert.equal(parseRoute(folderLink('parent')).id,'parent');
 assert.equal(organizationPatch(old,folders).folderPages[0].path,'New name');
});
test('folder page shows its description, child links and only its own descendant tests across view changes',async()=>{
 const window=environment(),paths:string[]=[],folders=changeFolder(changeFolder([],'parent','Cambridge',null),'child','Cam 16','parent').map(folder=>({...folder,description:'A curated collection of reading tests.'}));
 const root=createRoot(document.getElementById('app')!);
 try{await act(async()=>root.render(React.createElement(FolderPage,{id:'parent',folders,tests:[meta('one','child','Cambridge / Cam 16'),meta('other','elsewhere','Forecast')],profile,attempts:[],location:'/folders/parent?view=full',onNavigate:path=>paths.push(path)})));
 assert.match(document.body.textContent!,/A curated collection/);assert.ok(document.querySelector('a[href="/folders/child?view=full"]'));
 assert.deepEqual([...document.querySelectorAll('.practice-card h2')].map(node=>node.textContent),['Test one']);
 const switcher=[...document.querySelectorAll('button')].find(button=>button.textContent==='Passages & parts')!;
 await act(async()=>switcher.dispatchEvent(new window.Event('click',{bubbles:true})));assert.match(paths[0],/^\/folders\/parent\?view=practice/);
 assert.equal(document.querySelector('[aria-label="Source folder"]'),null);
 }finally{await act(async()=>root.unmount());}
});
test('automatic vocabulary lookup saves dictionary meanings and actual parts of speech, retaining source context',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({exists:true,word:'handful',results:[{meanings:[{definition:'A small number.',pos:'noun'},{definition:'As much as a hand can hold.',pos:'noun'}]}]}));
 try{const entry=await lookupVocabulary('handful','A handful of families migrated.');assert.deepEqual(entry,{word:'handful',meaning:'A small number.\nAs much as a hand can hold.',partOfSpeech:'noun',example:'A handful of families migrated.',dictionarySource:'minhqnd',definitionLanguage:'',phonetic:''});}finally{globalThis.fetch=original;}
});
test('notebook repairs legacy blanks automatically, skips existing definitions and retains record IDs',async()=>{
 environment();const original=globalThis.fetch,records:any[]=[];globalThis.fetch=async()=>new Response(JSON.stringify({exists:true,word:'district',results:[{meanings:[{definition:'An area of a city or country.',pos:'noun'}]}]}));
 const root=createRoot(document.getElementById('app')!),word:any={id:'legacy',word:'district',meaning:'',example:'The Guntur district.',partOfSpeech:'noun',owner:'learner',createdAt:1};
 try{await act(async()=>root.render(React.createElement(VocabularyView,{onUpdateProfile:async()=>{},profile,vocabulary:[word,{...word,id:'manual',meaning:'My own definition.'}],onSaveWord:async entry=>{records.push(entry);},onArchiveWord:async()=>{},onNotify:()=>{}})));
 assert.equal(records.length,1);assert.equal(records[0].id,'legacy');assert.equal(records[0].meaning,'An area of a city or country.');assert.equal(records[0].example,'The Guntur district.');assert.doesNotMatch(document.body.textContent!,/Needs definition|Look up definition/);
 }finally{await act(async()=>root.unmount());globalThis.fetch=original;}
});
test('a failed automatic lookup offers retry and never saves an empty word',async()=>{
 environment();const original=globalThis.fetch,records:any[]=[];globalThis.fetch=async()=>new Response('{}',{status:503});const root=createRoot(document.getElementById('app')!);
 try{await act(async()=>root.render(React.createElement(VocabularyView,{onUpdateProfile:async()=>{},profile,vocabulary:[{id:'missing',word:'unavailable',meaning:'',example:'',partOfSpeech:'noun'} as any],onSaveWord:async entry=>{records.push(entry);},onArchiveWord:async()=>{},onNotify:()=>{}})));
 assert.equal(records.length,0);assert.match(document.body.textContent!,/Could not load this definition/);assert.ok([...document.querySelectorAll('button')].some(button=>button.textContent==='Retry lookup'));
 }finally{await act(async()=>root.unmount());globalThis.fetch=original;}
});
test('mock builder shuffles distinct sections and starts practice with unlimited time',async()=>{
 const {build}=await import('esbuild'),{createRequire}=await import('node:module'),{mkdtempSync,rmSync}=await import('node:fs'),{resolve,join}=await import('node:path');
 const temp=mkdtempSync(resolve('node_modules/.cache/mock-builder-')),output=join(temp,'mock.cjs');
 await build({entryPoints:['src/components/MockBuilderView.tsx'],outfile:output,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'mock-library',setup(builder){builder.onResolve({filter:/services\/firestoreAdapter$/},()=>({path:'store',namespace:'stub'}));builder.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`export const firestoreAdapter={getTestComplete:async id=>({title:'Test '+id,parts:Array.from({length:3},(_,index)=>({id:'p'+index,title:'A very long passage title '+index,passageHtml:'<p>Passage</p>',questionHtml:'<p>Questions 1–1</p>',questions:[{number:1,kind:'fill_blank'}],slots:{s:{numbers:[1]}}}))})};`}));}}]});
 const window=environment(),{MockBuilderView}=createRequire(import.meta.url)(output),root=createRoot(document.getElementById('app')!),sessions:any[]=[];
 try{await act(async()=>root.render(React.createElement(MockBuilderView,{tests:[meta('one','f','Library')],onNotify:()=>{},onStartSession:(...args:any[])=>sessions.push(args)})));
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Shuffle')!.click());
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.startsWith('Practice'))!.click());
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Start practice')!.click());
 assert.equal(sessions.length,1);assert.equal(sessions[0][1],'practice');assert.equal(sessions[0][2],0);assert.equal(new Set(sessions[0][0].sourceSections.map((section:any)=>section.sectionId)).size,3);assert.deepEqual(sessions[0][0].parts.map((part:any)=>part.questions[0].number),[1,2,3]);
 }finally{await act(async()=>root.unmount());rmSync(temp,{recursive:true,force:true});}
});
