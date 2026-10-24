import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {FolderManager} from '../src/components/FolderManager';
import {FolderTree} from '../src/components/FolderTree';
import {copyFolderTree} from '../src/services/libraryClipboard';
import {changeFolder,folderLocation} from '../src/services/folders';
import {LIBRARY_DRAG_TYPE,readLibraryDrag} from '../src/services/libraryDrag';
const folders=changeFolder(changeFolder(changeFolder([],'cam','Cambridge',null),'book','Cam 16','cam'),'forecast','Forecast',null);
const tests:any[]=[{id:'read',title:'Reading test',folderId:'book',skill:'reading'},{id:'listen',title:'Listening test',folderId:'book',skill:'listening'}];
function dom(){const {window}=parseHTML('<html><body><div id="app"></div></body></html>');Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});return window;}
function keyboard(window:any,target:Element,key:string){const event=new window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(event,{ctrlKey:true,key});target.dispatchEvent(event);return event;}

test('folder copies include descendants once, use fresh IDs, retain descriptions and leave originals intact',()=>{
 let n=0;const original=folders.map(f=>({...f,description:'Original description',showInFullTestMenu:true}));
 const result=copyFolderTree(original,['cam','book'],null,()=>`copy-${++n}`);
 assert.equal(result.copies.size,2);assert.equal(folderLocation(result.copies.get('book'),result.folders),'Cambridge (copy) / Cam 16');
 assert.equal(result.folders.find(f=>f.id==='copy-1')?.description,'Original description');assert.equal(result.folders.find(f=>f.id==='copy-1')?.showInFullTestMenu,false);
 assert.equal(folderLocation('book',original),'Cambridge / Cam 16');assert.equal(original.length,3);
 assert.throws(()=>copyFolderTree(original,['cam'],'book',()=>`copy-${++n}`),/outside/);
});
test('Explorer tree expands, collapses the current ancestor and exposes both skills in one folder',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!);try{
 await act(async()=>root.render(React.createElement(FolderTree,{folders,tests,value:'book',onChange:()=>{}})));
 assert.ok([...document.querySelectorAll('.folder-tree-name')].some(el=>el.textContent==='Cam 162'));
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Collapse Cambridge"]')!.click());
 assert.ok(![...document.querySelectorAll('.folder-tree-name')].some(el=>el.textContent?.includes('Cam 16')));
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Expand Cambridge"]')!.click());assert.ok(document.querySelector('[aria-current="page"]'));
 }finally{await act(async()=>root.unmount());}
});
test('Rename is available directly without selecting a checkbox and opens the existing name',async()=>{
 dom();const root=createRoot(document.getElementById('app')!),writes:any[]=[];try{
 await act(async()=>root.render(React.createElement(FolderManager,{folders,tests,value:'',onOpen:()=>{},onChange:async next=>{writes.push(next);},onDelete:async()=>{}})));
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Rename folder Cambridge"]')!.click());
 assert.equal(document.querySelector<HTMLInputElement>('[aria-label="Folder name"]')!.value,'Cambridge');assert.equal(writes.length,0);
 assert.match(document.querySelector('dialog')!.textContent!,/Rename or move/);
 }finally{await act(async()=>root.unmount());}
});
test('cut/paste moves selected tests once, copy/paste makes copies, and typing fields retain normal shortcuts',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!),moves:any[]=[],copies:any[]=[];
 const props:any={folders,tests,value:'forecast',selectedTests:['read','listen'],onOpen:()=>{},onChange:async()=>{},onDelete:async()=>{},onMoveTests:async(...args:any[])=>{moves.push(args);},onCopyTests:async(...args:any[])=>{copies.push(args);},children:React.createElement('input',{'aria-label':'Typing'})};
 try{await act(async()=>root.render(React.createElement(FolderManager,props)));const area=document.querySelector('[aria-label="Manage folders"]')!;
 await act(async()=>{keyboard(window,area,'x');});await act(async()=>{keyboard(window,area,'v');});assert.deepEqual(moves,[[['read','listen'],'forecast']]);
 await act(async()=>{keyboard(window,area,'v');});assert.equal(moves.length,1,'cut clipboard is cleared');
 await act(async()=>{keyboard(window,area,'c');});await act(async()=>{keyboard(window,area,'v');});assert.deepEqual(copies,[[['read','listen'],'forecast']]);
 await act(async()=>{const event=keyboard(window,document.querySelector('[aria-label="Typing"]')!,'v');assert.equal(event.defaultPrevented,false);});assert.equal(copies.length,1);
 }finally{await act(async()=>root.unmount());}
});
test('internal test drops move the chosen IDs; file drops are ignored and illegal folder drops report errors',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!),moves:any[]=[];try{
 await act(async()=>root.render(React.createElement(FolderManager,{folders,tests,value:'book',onOpen:()=>{},onChange:async()=>{},onDelete:async()=>{},onMoveTests:async(...args:any[])=>{moves.push(args);}})));
 const drop=async(item:unknown)=>{const target=[...document.querySelectorAll('.folder-tree-row')].find(el=>el.textContent?.includes('Cam 16'))!;const e=new window.Event('drop',{bubbles:true,cancelable:true});Object.assign(e,{dataTransfer:{types:[LIBRARY_DRAG_TYPE],getData:()=>JSON.stringify(item)}});await act(async()=>target.dispatchEvent(e));};
 await drop({kind:'tests',ids:['read','listen','read']});assert.deepEqual(moves,[[['read','listen'],'book']]);
 await drop({kind:'folder',id:'cam'});assert.match(document.querySelector('[role="alert"]')!.textContent!,/inside itself/);
 assert.equal(readLibraryDrag({getData:()=>''}),null);assert.equal(readLibraryDrag({getData:()=>'{"kind":"tests","ids":[5]}'}),null);
 }finally{await act(async()=>root.unmount());}
});

test('folder cut/paste works from a focused checkbox, and Unfiled has tests without showing root folders',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!),writes:any[]=[];let value='';
 const render=()=>root.render(React.createElement(FolderManager,{folders,tests,value,onOpen:id=>{value=id;render();},onChange:async next=>{writes.push(next);},onDelete:async()=>{}}));
 try{await act(async()=>render());const input=document.querySelector<HTMLInputElement>('[aria-label="Select folder Cambridge"]')!;
 await act(async()=>{input.checked=true;input.dispatchEvent(new window.Event('click',{bubbles:true}));});
 await act(async()=>{keyboard(window,input,'x');});
 const forecast=[...document.querySelectorAll<HTMLButtonElement>('.folder-tree-name')].find(node=>node.textContent==='Forecast0')!;
 await act(async()=>forecast.click());await act(async()=>{keyboard(window,document.querySelector('[aria-label="Manage folders"]')!,'v');});
 assert.equal(folderLocation('book',writes[0]),'Forecast / Cambridge / Cam 16');
 value='unfiled';await act(async()=>render());assert.equal(document.querySelectorAll('.folder-manager-list article').length,0);
 }finally{await act(async()=>root.unmount());}
});
test('copying a folder pastes its tests into the new descendant IDs with the updated registry',async()=>{
 const window=dom(),root=createRoot(document.getElementById('app')!),copies:any[]=[],registries:any[]=[];let value='';
 const render=()=>root.render(React.createElement(FolderManager,{folders,tests,value,onOpen:id=>{value=id;render();},onChange:async next=>{registries.push(next);},onDelete:async()=>{},onCopyTests:async(...args:any[])=>{copies.push(args);}}));
 try{await act(async()=>render());const row=document.querySelector('[aria-label="Rename folder Cambridge"]')!.closest('article')!;
 await act(async()=>[...row.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent==='Copy')!.click());
 const forecast=[...document.querySelectorAll<HTMLButtonElement>('.folder-tree-name')].find(node=>node.textContent==='Forecast0')!;await act(async()=>forecast.click());
 await act(async()=>{keyboard(window,document.querySelector('[aria-label="Manage folders"]')!,'v');});
 assert.equal(registries.length,1);assert.equal(copies.length,1);assert.deepEqual(copies[0][0],['read','listen']);assert.equal(folderLocation(copies[0][1],copies[0][2]),'Forecast / Cambridge / Cam 16');assert.equal(copies[0][2],registries[0]);
 }finally{await act(async()=>root.unmount());}
});
