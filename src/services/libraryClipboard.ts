import {changeFolder,isFolderWithin,type LibraryFolder} from './folders';
export type LibraryClipboard={mode:'cut'|'copy';kind:'tests'|'folders';ids:string[]};
/** Snapshot descendants before creating copies, retaining media references on tests. */
export function copyFolderTree(folders:LibraryFolder[],ids:string[],target:string|null,makeId:()=>string){
 const roots=ids.filter(id=>folders.some(f=>f.id===id&&!f.deletedAt)&&!ids.some(other=>other!==id&&isFolderWithin(id,other,folders)));
 if(!roots.length)throw new Error('Select a folder to copy.');
 if(target&&roots.some(id=>isFolderWithin(target,id,folders)))throw new Error('Choose a destination outside the selected folders.');
 let next=folders;const copies=new Map<string,string>();
 const add=(id:string,parentId:string|null,root=false)=>{const source=folders.find(f=>f.id===id)!;let name=source.name;
  if(root){let index=1;while(next.some(f=>!f.deletedAt&&f.parentId===parentId&&f.name.toLocaleLowerCase()===name.toLocaleLowerCase()))name=source.name+' (copy'+(index++>1?' '+(index-1):'')+')';}
  const newId=makeId();next=changeFolder(next,newId,name,parentId).map(f=>f.id===newId?{...f,description:source.description||''}:f);copies.set(id,newId);
  for(const child of folders.filter(f=>!f.deletedAt&&f.parentId===id))add(child.id,newId);
 };
 roots.forEach(id=>add(id,target,true));return {folders:next,copies};
}
