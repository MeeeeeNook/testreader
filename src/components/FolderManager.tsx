import React,{useState} from 'react';
import {Folder,ChevronRight,Trash2,Search,FolderOpen} from 'lucide-react';
import type {TestMeta} from '../types';
import {folderChildren,folderPath,inFolder,allFolderPaths,planFolderDeletion} from '../services/catalog';
import {ConfirmActionDialog} from './ConfirmActionDialog';
export function FolderManager({tests,value,onOpen,onDelete}:{tests:TestMeta[];value:string;onOpen:(path:string)=>void;onDelete:(ids:string[])=>Promise<void>}){
 const [selected,setSelected]=useState<string[]>([]),[search,setSearch]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const live=tests.filter(t=>!t.deletedAt),segments=folderPath(value).split(' / ').filter(Boolean);
 const children=search?allFolderPaths(live).filter(p=>p.toLowerCase().includes(search.toLowerCase())).map(p=>[p,live.filter(t=>inFolder(t.source||'Unfiled',p)).length] as [string,number]):folderChildren(live,value);
 const plan=planFolderDeletion(live,selected);
 const toggle=(path:string,checked:boolean)=>setSelected(prev=>checked?[...new Set([...prev,path])]:prev.filter(p=>p!==path));
 return <section className="folder-manager" aria-label="Manage folders">
 <div className="folder-manager-top"><div><h2>Your folders</h2><p>Browse sources, select folders, and manage their tests.</p></div><label className="folder-search"><Search size={17}/><input aria-label="Search folders" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a folder…"/></label></div>
 <nav className="folder-breadcrumbs" aria-label="Folder breadcrumb"><button onClick={()=>{onOpen('');setSearch('');}}>All folders</button>{segments.map((name,i)=><React.Fragment key={i}><ChevronRight size={14}/><button onClick={()=>{onOpen(segments.slice(0,i+1).join(' / '));setSearch('');}}>{name}</button></React.Fragment>)}</nav>
 <div className="folder-selection-bar"><label><input type="checkbox" aria-label="Select all shown folders" checked={children.length>0&&children.every(([p])=>selected.includes(p))} disabled={!children.length||busy} onChange={e=>setSelected(prev=>e.target.checked?[...new Set([...prev,...children.map(([p])=>p)])]:prev.filter(p=>!children.some(([path])=>path===p)))}/>Select shown folders</label><span>{selected.length} selected</span>{selected.length>0&&<><button disabled={busy} onClick={()=>setSelected([])}>Clear</button><button className="folder-delete-button" disabled={busy||!plan.ids.length} onClick={()=>setConfirm(true)}><Trash2 size={16}/>Delete folders</button></>}</div>
 {error&&<p role="alert" className="studio-callout">{error}</p>}
 <div className="folder-manager-grid">{children.map(([path,count])=><article className={selected.includes(path)?'selected':''} key={path}><label className="folder-select"><input aria-label={'Select folder '+path} type="checkbox" checked={selected.includes(path)} disabled={busy} onChange={e=>toggle(path,e.target.checked)}/></label><button className="folder-open" onClick={()=>{onOpen(path);setSearch('');}}><span className="folder-icon"><Folder size={24} strokeWidth={1.6}/></span><strong>{path.split(' / ').at(-1)}</strong><small>{count} tests · Includes subfolders</small>{search&&<small>{path}</small>}<span className="folder-open-label">Open folder <ChevronRight size={14}/></span></button></article>)}</div>
 {!children.length&&<div className="studio-empty"><FolderOpen size={32}/><h3>{search?'No matching folders':'No subfolders here'}</h3><p>{search?'Try a different folder name.':'Use the test list below to move tests to a new folder path.'}</p></div>}
 {confirm&&<ConfirmActionDialog title="Move selected folders to Trash?" confirmLabel={'Move '+plan.ids.length+' tests to Trash'} onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);setBusy(true);setError('');void onDelete(plan.ids).then(()=>{setSelected([]);if(plan.folders.some(p=>inFolder(value,p)))onOpen('');}).catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setBusy(false));}}>{plan.folders.length} selected folder(s), including all subfolders, contain {plan.ids.length} tests. Published, draft and archived tests will move to Trash. Their passages, answers and attempt history are preserved. Restore tests from Trash to bring their folder paths back: {plan.folders.join('; ')}.</ConfirmActionDialog>}
 </section>;
}

