import {acceptsLibraryDrag,readLibraryDrag,type LibraryDrag} from '../services/libraryDrag';
import React,{useState} from 'react';
import {ChevronRight,Folder,FolderOpen,Library,Inbox,Search} from 'lucide-react';
import {folderOptions,isFolderWithin,type LibraryFolder} from '../services/folders';
import type {TestMeta} from '../types';

/** One hierarchy shared by browsing, management and destination selection. */
export function FolderTree({folders,tests=[],value,onChange,includeUnfiled=false,rootLabel='All folders',onDropItem}:{folders:LibraryFolder[];tests?:TestMeta[];value:string;onChange:(id:string)=>void;includeUnfiled?:boolean;rootLabel?:string;onDropItem?:(item:LibraryDrag,target:string)=>void}) {
 const [query,setQuery]=useState(''),[expanded,setExpanded]=useState<Record<string,boolean>>({});
 const options=folderOptions(folders),needle=query.trim().toLocaleLowerCase();
 const count=(id:string)=>tests.filter(t=>!t.deletedAt&&(!id||(id==='unfiled'?!options.some(f=>f.id===t.folderId):isFolderWithin(t.folderId,id,folders)))).length;
 const dropProps=(target:string)=>onDropItem?{onDragOver:(e:React.DragEvent)=>{if(acceptsLibraryDrag(e.dataTransfer)){e.preventDefault();e.dataTransfer.dropEffect='move';e.currentTarget.classList.add('drop-target');}},onDragLeave:(e:React.DragEvent)=>e.currentTarget.classList.remove('drop-target'),onDrop:(e:React.DragEvent)=>{e.currentTarget.classList.remove('drop-target');const item=readLibraryDrag(e.dataTransfer);if(item){e.preventDefault();e.stopPropagation();onDropItem(item,target);}}}:{};
 const rows=(parent:string|null,depth=0):React.ReactNode=>options.filter(f=>f.parentId===parent).map(f=>{
  const children=options.some(c=>c.parentId===f.id),open=expanded[f.id]??isFolderWithin(value,f.id,folders),visible=!needle||f.path.toLocaleLowerCase().includes(needle)||options.some(c=>isFolderWithin(c.id,f.id,folders)&&c.path.toLocaleLowerCase().includes(needle));
  if(!visible)return null;
  return <React.Fragment key={f.id}><div className={'folder-tree-row'+(value===f.id?' active':'')} style={{paddingLeft:depth*16}} {...dropProps(f.id)}>{children?<button type="button" className="folder-tree-toggle" aria-label={(open?'Collapse ':'Expand ')+f.name} aria-expanded={open} onClick={()=>setExpanded(prev=>({...prev,[f.id]:!open}))}><ChevronRight size={14} style={{transform:open?'rotate(90deg)':undefined}}/></button>:<span className="folder-tree-spacer"/>}<button type="button" className="folder-tree-name" aria-current={value===f.id?'page':undefined} onClick={()=>onChange(f.id)}>{value===f.id?<FolderOpen size={17}/>:<Folder size={17}/>}<span>{f.name}</span>{tests.length>0&&<small>{count(f.id)}</small>}</button></div>{children&&(open||needle)&&rows(f.id,depth+1)}</React.Fragment>;
 });
 return <nav className="folder-tree" aria-label="Folder navigation"><label className="folder-tree-search"><Search size={15}/><input aria-label="Find folders" placeholder="Find a folder" value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" className={'folder-tree-root'+(!value?' active':'')} onClick={()=>onChange('')} {...dropProps('')} aria-current={!value?'page':undefined}><Library size={17}/><span>{rootLabel}</span>{tests.length>0&&<small>{count('')}</small>}</button>{includeUnfiled&&<button type="button" className={'folder-tree-root'+(value==='unfiled'?' active':'')} onClick={()=>onChange('unfiled')} {...dropProps('unfiled')}><Inbox size={17}/><span>Unfiled</span><small>{count('unfiled')}</small></button>}<div className="folder-tree-branches">{rows(null)}</div>{needle&&!options.some(f=>f.path.toLocaleLowerCase().includes(needle))&&<p>No matching folders.</p>}</nav>;
}
