import React,{useRef,useId} from 'react';
import {Folder,ChevronDown} from 'lucide-react';
import {FolderTree} from './FolderTree';
import {folderLocation,type LibraryFolder} from '../services/folders';
export function FolderPicker({folders,value,onChange,label='Folder',disabled=false,rootLabel='Unfiled (no folder)'}:{folders:LibraryFolder[];value:string;onChange:(id:string)=>void;label?:string;disabled?:boolean;rootLabel?:string}) {
 const popup=useRef<HTMLDetailsElement>(null),id=useId(),path=folderLocation(value,folders);
 return <div className="studio-field folder-destination"><span id={id}>{label}</span><details ref={popup} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();if(popup.current)popup.current.open=false;popup.current?.querySelector('summary')?.focus();}}}><summary aria-label={label} aria-disabled={disabled} onClick={e=>{if(disabled)e.preventDefault();}}><Folder size={16}/><span>{path||rootLabel}</span><ChevronDown size={15}/></summary><div className="folder-destination-popup"><FolderTree folders={folders} value={value} rootLabel={rootLabel} onChange={id=>{if(disabled)return;onChange(id);if(popup.current)popup.current.open=false;popup.current?.querySelector('summary')?.focus();}}/></div></details></div>;
}
