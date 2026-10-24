import type {TestMeta} from '../types';
export type FolderSkill='reading'|'listening';
export interface LibraryFolder {aliases?:string[];skill?:FolderSkill;id:string;name:string;parentId:string|null;createdAt:number;updatedAt:number;description?:string;deletedAt?:number|null;showInFullTestMenu?:boolean}
export interface PublicFolder {aliases?:string[];skill?:FolderSkill;id:string;name:string;path:string;parentId:string|null;description?:string}
export interface MenuFolder {id:string;path:string}
const normalizePath=(path:string)=>path.split(/[\\/]/).map(s=>s.trim().normalize('NFC')).filter(Boolean).join(' / ');
// Stable, encoded paths avoid random IDs when recovering a missing registry.
const recoveredId=(path:string)=>'folder_'+encodeURIComponent(path);
export function reconcileLibrary(folders:LibraryFolder[],tests:TestMeta[]) {
 const published=new Map<string,PublicFolder>();
 for(const test of [...tests].sort((a,b)=>a.updatedAt-b.updatedAt)){
  for(const menu of test.fullTestMenuFolders||[])published.set(menu.id,{id:menu.id,name:normalizePath(menu.path).split(' / ').at(-1)||menu.path,path:normalizePath(menu.path),parentId:null});
  for(const folder of test.folderPages||[])published.set(folder.id,{...folder});
 }
 const knownPaths=new Map([...published.values()].map(folder=>[folder.path,folder.id]));
 for(const folder of [...published.values()]){
  const parts=folder.path.split(' / ');
  for(let index=0;index<parts.length-1;index++){
   const path=parts.slice(0,index+1).join(' / ');
   if(!knownPaths.has(path)){const id=recoveredId(path);knownPaths.set(path,id);published.set(id,{id,name:parts[index],path,parentId:null});}
  }
 }
 for(const folder of published.values()){if(folder.parentId&&published.has(folder.parentId))continue;const parentPath=folder.path.split(' / ').slice(0,-1).join(' / ');folder.parentId=parentPath?knownPaths.get(parentPath)||null:null;}
 const next=folders.map(f=>({...f}));
 for(const folder of published.values())if(!next.some(f=>f.id===folder.id))next.push({...folder,createdAt:0,updatedAt:0});
 const byPath=new Map(folderOptions(next).map(f=>[f.path,f.id]));
 const assignments=new Map<string,string>();
 for(const test of [...tests].sort((a,b)=>a.id.localeCompare(b.id))){
  // A known ID is authoritative, including deleted folders. Do not resurrect them.
  if(test.folderId&&next.some(f=>f.id===test.folderId))continue;
  const path=normalizePath(test.folderPath||'');if(!path)continue;
  const parts=path.split(' / ');let parentId:string|null=null;
  for(let i=0;i<parts.length;i++){
   const key=parts.slice(0,i+1).join(' / ');let id=next.find(f=>!f.deletedAt&&folderLocation(f.id,next)===key)?.id;
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
 const shared=sharedFolders(next);
 const canonical=(id:string|null|undefined)=>shared.find(f=>f.id===id||f.aliases?.includes(id||''))?.id||id;
 return {folders:shared,tests:resolved.map(test=>{const folderId=canonical(test.folderId);return {...test,folderId,folderPath:folderLocation(folderId,shared),folderPages:publicFolderPages({folderId},shared),fullTestMenuFolders:[...new Map((test.fullTestMenuFolders||[]).map(f=>{const id=canonical(f.id)||f.id;return [id,{id,path:folderLocation(id,shared)||f.path}]})).values()]};})};
}
export function menuFoldersForTest(test:Pick<TestMeta,'folderId'>,folders:LibraryFolder[]):MenuFolder[]{
 return folderOptions(folders).filter(f=>folders.find(item=>item.id===f.id)?.showInFullTestMenu===true&&isFolderWithin(test.folderId,f.id,folders)).map(({id,path})=>({id,path}));
}
export function fullTestMenu(tests:TestMeta[],skill?:FolderSkill){
 const full=tests.filter(t=>(!skill||t.skill===skill)&&!t.deletedAt&&t.status==='published'&&t.passages===(t.skill==='reading'?3:4));
 const entries=new Map<string,MenuFolder&{count:number}>();
 for(const test of full){const seen=new Set<string>();for(const f of test.fullTestMenuFolders||[]){if(!f.id||!f.path||seen.has(f.id))continue;seen.add(f.id);const current=entries.get(f.id);entries.set(f.id,{id:f.id,path:f.path,count:(current?.count||0)+1});}}
 return {full,folders:[...entries.values()].sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true}))};
}
export const folderLink=(id:string,skill?:FolderSkill)=>'/folders/'+encodeURIComponent(id)+(skill?'?skill='+skill:'');
export function publicFolderPages(test:Pick<TestMeta,'folderId'>,folders:LibraryFolder[]):PublicFolder[]{
 return folderOptions(folders).filter(folder=>isFolderWithin(test.folderId,folder.id,folders)).map(folder=>({id:folder.id,name:folder.name,path:folder.path,parentId:folder.parentId,description:folders.find(f=>f.id===folder.id)?.description?.trim()||'',aliases:folders.find(f=>f.id===folder.id)?.aliases||[],...(folders.find(f=>f.id===folder.id)?.skill?{skill:folders.find(f=>f.id===folder.id)!.skill}:{})}));
}
export function folderDescription(folder:Pick<PublicFolder,'name'|'path'|'description'>,skill?:FolderSkill){
 return folder.description?.trim()||`Explore IELTS ${skill||'reading and listening'} material in ${folder.path}. Choose a full test or practise one passage or part at your own pace.`;
}
export function organizationPatch(test:TestMeta,folders:LibraryFolder[]){
 return {folderId:test.folderId||null,folderPath:folderLocation(test.folderId,folders),fullTestMenuFolders:menuFoldersForTest(test,folders),folderPages:publicFolderPages(test,folders)};
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
export function changeFolder(folders:LibraryFolder[],id:string,name:string,parentId:string|null,skill?:FolderSkill):LibraryFolder[] {
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


// Infer legacy folder membership from tests, while explicitly typed empty folders
// remain available for the intended skill before the first upload.
export function folderSkills(id:string,folders:LibraryFolder[],tests:TestMeta[]):FolderSkill[]{
 const skills=new Set<FolderSkill>();
 for(const test of tests)if(!test.deletedAt&&isFolderWithin(test.folderId,id,folders))skills.add(test.skill==='listening'?'listening':'reading');
 for(const folder of folders)if(!folder.deletedAt&&folder.skill&&isFolderWithin(folder.id,id,folders))skills.add(folder.skill);
 if(!skills.size){let current=folders.find(f=>f.id===id);const seen=new Set<string>();while(current&&!seen.has(current.id)){seen.add(current.id);if(current.skill){skills.add(current.skill);break}current=folders.find(f=>f.id===current!.parentId)}}
 return skills.size?[...skills]:['reading'];
}
export function foldersForSkill(folders:LibraryFolder[],tests:TestMeta[],skill:FolderSkill){return folders.filter(f=>!f.deletedAt)}

// Consolidate legacy skill-specific copies by full path; old URLs stay valid.
export function sharedFolders(folders:LibraryFolder[]):LibraryFolder[]{
 const result:LibraryFolder[]=[],byPath=new Map<string,LibraryFolder>(),ids=new Map<string,string>();
 const ordered=[...folders].sort((a,b)=>folderLocation(a.id,folders).split(' / ').length-folderLocation(b.id,folders).split(' / ').length||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
 for(const folder of ordered){
  const path=folderLocation(folder.id,folders),key=path.normalize('NFC').toLocaleLowerCase();
  const existing=path?byPath.get(key):undefined;
  if(existing){ids.set(folder.id,existing.id);existing.aliases=[...new Set([...(existing.aliases||[]),folder.id,...(folder.aliases||[])])];existing.showInFullTestMenu=existing.showInFullTestMenu||folder.showInFullTestMenu;existing.description=existing.description||folder.description;continue;}
  const {skill,...rest}=folder;const next={...rest,parentId:folder.parentId?(ids.get(folder.parentId)||folder.parentId):null};
  result.push(next);ids.set(folder.id,next.id);if(path)byPath.set(key,next);
 }
 return result;
}
