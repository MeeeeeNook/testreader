import React from 'react';
import {folderOptions,type LibraryFolder} from '../services/folders';
export function FolderPicker({folders,value,onChange,label='Folder',disabled=false}:{folders:LibraryFolder[];value:string;onChange:(id:string)=>void;label?:string;disabled?:boolean}){
 const options=folderOptions(folders);
 return <label className="studio-field">{label}<select aria-label={label} value={options.some(f=>f.id===value)?value:''} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">Unfiled (no folder)</option>{options.map(f=><option key={f.id} value={f.id}>{f.path}</option>)}</select></label>;
}

