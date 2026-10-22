import type {TestMeta} from '../types';
export interface LibraryFolder {id:string;name:string;parentId:string|null;createdAt:number;updatedAt:number;deletedAt?:number|null;showInFullTestMenu?:boolean}
export interface MenuFolder {id:string;path:string}
const normalizePath=(path:string)=>path.split(/[\\/]/).map(s=>s.trim().normalize('NFC')).filter(Boolean).join(' / ');
// Stable, encoded paths avoid random IDs when recovering a missing registry.
const recoveredId=(path:string)=>'folder_'+encodeURIComponent(path);
export function reconcileLibrary(folders:LibraryFolder[],tests:TestMeta[]) {
 const next=folders.map(f=>({...f})),byPath=new Map(folderOptions(next).map(f=>[f.path,f.id]));
 const assignments=new Map<string,string>();
 for(const test of [...tests].sort((a,b)=>a.id.localeCompare(b.id))){
  // A known ID is authoritative, including deleted folders. Do not resurrect them.
  if(test.folderId&&next.some(f=>f.id===test.folderId))continue;
  const path=normalizePath(test.folderPath||'');if(!path)continue;
  const parts=path.split(' / ');let parentId:string|null=null;
  for(let i=0;i<parts.length;i++){
   const key=parts.slice(0,i+1).join(' / ');let id=byPath.get(key);
   if(!id){
    const preferred=i===parts.length-1?test.folderId:null;
    id=preferred&&!next.some(f=>f.id===preferred)?preferred:recoveredId(key);
    if(next.some(f=>f.id===id))id=recoveredId(key)+'_recovered';
    next.push({id,name:parts[i],parentId,createdAt:test.createdAt||test.updatedAt||0,updatedAt:test.updatedAt||0,showInFullTestMenu:false});byPath.set(key,id);
   }
   parentId=id;
  }
  if(parentId)assignments.set(test.id,parentId);
 }
 const resolved=tests.map(test=>{
  const folderId=assignments.get(test.id)||test.folderId;
  const folderPath=folderLocation(folderId,next);
  return folderId!==test.folderId||folderPath!==(test.folderPath||'')?{...test,folderId:folderId||null,folderPath}:test;
 });
 return {folders:next,tests:resolved};
}
export function menuFoldersForTest(test:Pick<TestMeta,'folderId'>,folders:LibraryFolder[]):MenuFolder[]{
 return folderOptions(folders).filter(f=>folders.find(item=>item.id===f.id)?.showInFullTestMenu===true&&isFolderWithin(test.folderId,f.id,folders)).map(({id,path})=>({id,path}));
}
export function fullTestMenu(tests:TestMeta[]){
 const full=tests.filter(t=>!t.deletedAt&&t.status==='published'&&t.passages===(t.skill==='reading'?3:4));
 const entries=new Map<string,MenuFolder&{count:number}>();
 for(const test of full){const seen=new Set<string>();for(const f of test.fullTestMenuFolders||[]){if(!f.id||!f.path||seen.has(f.id))continue;seen.add(f.id);const current=entries.get(f.id);entries.set(f.id,{id:f.id,path:f.path,count:(current?.count||0)+1});}}
 return {full,folders:[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true}))};
}
export function organizationPatch(test:TestMeta,folders:LibraryFolder[]){
 return {folderId:test.folderId||null,folderPath:folderLocation(test.folderId,folders),fullTestMenuFolders:menuFoldersForTest(test,folders)};
}
export function folderLocation(id:string|null|undefined,folders:LibraryFolder[]):string {
 if(!id)return '';const names:string[]=[],seen=new Set<string>();let next:string|null|undefined=id;
 while(next){if(seen.has(next))return '';seen.add(next);const f=folders.find(f=>f.id===next);if(!f||f.deletedAt)return '';names.unshift(f.name);next=f.parentId;}
 return names.join(' / ');
}
export function folderOptions(folders:LibraryFolder[]){return folders.map(f=>({id:f.id,name:f.name,path:folderLocation(f.id,folders),parentId:f.parentId})).filter(f=>f.path).sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true}));}
export function isFolderWithin(id:string|undefined|null,parent:string,folders:LibraryFolder[]):boolean {
 let next=id;const seen=new Set<string>();while(next&&!seen.has(next)){if(next===parent)return true;seen.add(next);next=folders.find(f=>f.id===next)?.parentId;}return false;
}
export function testInFolder(test:TestMeta,filter:string,folders:LibraryFolder[],recursive=true) {
 if(!filter)return true;if(filter==='unfiled')return !folderLocation(test.folderId,folders);
 return recursive?isFolderWithin(test.folderId,filter,folders):test.folderId===filter;
}
export function changeFolder(folders:LibraryFolder[],id:string,name:string,parentId:string|null):LibraryFolder[] {
 const clean=name.trim().normalize('NFC');
 if(!clean||clean.length>80||/[\\/]/.test(clean))throw new Error('Use a folder name of 1–80 characters, without / or \\.');
 if(parentId&&!folderLocation(parentId,folders))throw new Error('Choose an existing parent folder.');
 if(parentId&&(parentId===id||isFolderWithin(parentId,id,folders)))throw new Error('A folder cannot be moved inside itself or its subfolders.');
 if(folders.some(f=>f.id!==id&&!f.deletedAt&&f.parentId===parentId&&f.name.toLocaleLowerCase()===clean.toLocaleLowerCase()))throw new Error('A folder with this name already exists here.');
 const previous=folders.find(f=>f.id===id),now=Date.now();
 const next={...previous,id,name:clean,parentId,createdAt:previous?.createdAt||now,updatedAt:now,deletedAt:null,showInFullTestMenu:previous?.showInFullTestMenu===true};
 return previous?folders.map(f=>f.id===id?next:f):[...folders,next];
}
export function folderDeletion(folders:LibraryFolder[],tests:TestMeta[],selected:string[]){
 const roots=[...new Set(selected)].filter(id=>folderLocation(id,folders)&&!selected.some(other=>other!==id&&isFolderWithin(id,other,folders)));
 const ids=folders.filter(f=>roots.some(root=>isFolderWithin(f.id,root,folders))).map(f=>f.id);
 return {roots,folderIds:ids,testIds:tests.filter(t=>!t.deletedAt&&ids.includes(t.folderId||'')).map(t=>t.id)};
}
export function trashFolders(folders:LibraryFolder[],ids:string[]){const now=Date.now();return folders.map(f=>ids.includes(f.id)?{...f,deletedAt:now,updatedAt:now}:f);}
export function restoreFolders(folders:LibraryFolder[],id:string){const ids=new Set(folders.filter(f=>isFolderWithin(f.id,id,folders)).map(f=>f.id));let next:string|null|undefined=id;const seen=new Set<string>();while(next&&!seen.has(next)){seen.add(next);ids.add(next);next=folders.find(f=>f.id===next)?.parentId;}return folders.map(f=>ids.has(f.id)?{...f,deletedAt:null,updatedAt:Date.now()}:f);}

