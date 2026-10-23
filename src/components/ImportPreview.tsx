import {Select} from "./Select";
import {ImportContents} from "./ImportContents";
import {FolderPicker} from "./FolderPicker";
import {FolderForm} from "./FolderManager";
import {folderLocation,foldersForSkill,type LibraryFolder} from "../services/folders";
import React,{useState,useEffect,useRef} from 'react';
import type {ImportPlan,ImportCandidate} from '../services/importPreview';
import {auditTest} from '../services/testAudit';
import {folderPath} from '../services/catalog';
import {ListeningMediaEditor} from './ListeningMediaEditor';
import {audioMime} from '../services/listening';
import {createId} from '../services/ids';
export function ImportPreview({plan,folders=[],tests=[],onSaveFolders,onCancel,onConfirm}:{plan:ImportPlan;folders?:LibraryFolder[];tests?:import('../types').TestMeta[];onSaveFolders?:(folders:LibraryFolder[])=>Promise<void>;existingIds?:Set<string>;onCancel:()=>void;onConfirm:(items:ImportCandidate[])=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=dialog.current;if(!el)return;if(typeof el.showModal==='function')el.showModal();else el.setAttribute('open','');},[]);
 const [selected,setSelected]=useState(()=>new Set(plan.candidates.map((_,i)=>i)));
 const [titles,setTitles]=useState<Record<number,string>>({});
 const [edits,setEdits]=useState<Record<number,import('../types').EditableTest>>({});
 const [audioBusy,setAudioBusy]=useState(false);
 const [folder,setFolder]=useState('');const [status,setStatus]=useState<'draft'|'published'>('draft');
 const [showNewFolder,setShowNewFolder]=useState(false);
 const [current,setCurrent]=useState(0);const [query,setQuery]=useState('');
 const duplicates=plan.candidates.filter(c=>c.match).length;
 const visible=plan.candidates.map((c,index)=>({...c,index})).filter(c=>`${c.test.title} ${c.name}`.toLowerCase().includes(query.toLowerCase()));
 const batchSkill=plan.skill||plan.candidates[0]?.test.skill||'reading';
 const scopedFolders=foldersForSkill(folders,tests,batchSkill);
 const validFolder=scopedFolders.some(f=>f.id===folder)?folder:'';
 const candidate=plan.candidates[current];
 const item=candidate?{...candidate,test:edits[current]||candidate.test}:undefined;
 return <div className="import-preview-backdrop"><dialog ref={dialog} onCancel={e=>{e.preventDefault();onCancel();}} aria-label="Import preview" className="import-preview">
 <header><div><span className="studio-eyebrow">LOCAL PREVIEW · NO TESTS IMPORTED YET</span><h2>{plan.skill==='listening'?'Listening import':plan.skill==='reading'?'Reading import':'Import preview'}</h2><p>{plan.candidates.length} tests · {plan.images.length} images · {(plan.recordings||[]).length} audio files · {duplicates} content matches · {plan.errors.length} file errors</p></div><button onClick={onCancel} className="studio-secondary">Cancel import</button></header>
 {showNewFolder&&<FolderForm folders={folders} skill={batchSkill} parent={validFolder||null} onCancel={()=>setShowNewFolder(false)} onSave={async next=>{if(!onSaveFolders)throw new Error("Folder saving unavailable.");await onSaveFolders(next);const created=next.find(f=>!folders.some(old=>old.id===f.id));if(created)setFolder(created.id);}}/>}
 <div className="import-preview-options"><FolderPicker folders={scopedFolders} value={validFolder} onChange={setFolder} label={'Import '+(batchSkill==='reading'?'Reading':'Listening')+' into'}/>{onSaveFolders&&<button className="studio-secondary" onClick={()=>setShowNewFolder(true)}>New folder</button>}<label>Status after import<Select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="draft">Draft</option><option value="published">Published</option></Select></label></div>
 {plan.skill==='listening'&&<p className="studio-callout">Before upload, recordings are compressed on your device to mono MP3 at 48 kbps. Smaller originals are kept. Compression and upload progress are shown after confirmation. Encoder: <a href="https://lame.sourceforge.net/" target="_blank" rel="noreferrer">LAME</a> / lamejs (LGPL).</p>}
 {duplicates>0&&<p className="studio-callout">Some tests have matching content. Their names are shown below. Selected tests are always imported as new copies; deselect any copy you do not want.</p>}
 {plan.errors.length>0&&<details className="import-errors"><summary>File errors ({plan.errors.length})</summary><ul>{plan.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></details>}
 <div className="import-preview-body"><aside><input aria-label="Search preview" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search test or file name…"/><div className="import-selection"><button onClick={()=>setSelected(new Set(visible.map(c=>c.index)))}>Select filtered results</button><button onClick={()=>setSelected(new Set())}>Clear selection</button><span>{selected.size} selected</span></div>
 <div className="import-candidate-list">{visible.map(({test,name,index})=><div key={index} className={index===current?'active':''}><input type="checkbox" aria-label={`Import ${test.title}`} checked={selected.has(index)} onChange={e=>setSelected(prev=>{const next=new Set(prev);e.target.checked?next.add(index):next.delete(index);return next;})}/><button onClick={()=>setCurrent(index)}><strong>{titles[index]??test.title}</strong><small>{test.parts.length} passage · {test.parts.reduce((n,p)=>n+p.questions.length,0)} questions</small><small>{name}</small>{plan.candidates[index].match&&<small className="import-match">Same content as: {plan.candidates[index].match!.title} ({plan.candidates[index].match!.folder})</small>}</button></div>)}</div></aside>
 <main>{item?<><label>Test title<input aria-label="Preview test title" value={titles[current]??item.test.title} onChange={e=>setTitles({...titles,[current]:e.target.value})}/></label><p>{folderLocation(folder,folders)||"Unfiled"} · {item.test.skill} · {item.test.duration} min</p>
 {auditTest(item.test).length>0&&<details><summary>Needs review ({auditTest(item.test).length})</summary><ul>{auditTest(item.test).map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>}
 <label>Skill<Select aria-label="Import skill" value={item.test.skill} onChange={e=>setEdits({...edits,[current]:{...item.test,skill:e.target.value as 'reading'|'listening',duration:e.target.value==='listening'?30:60}})}><option value="reading">Reading</option><option value="listening">Listening</option></Select></label>{item.test.skill==='listening'&&<ListeningMediaEditor test={item.test} onChange={test=>{plan.candidates[current].test=test;setEdits(prev=>({...prev,[current]:test}));}} onBusyChange={setAudioBusy} onUpload={async file=>{const blob=new Blob([file],{type:audioMime(file.name)}),url=URL.createObjectURL(blob);(plan.recordings||=[]).push({name:file.name,url,blob});return {id:createId(),name:file.name,url,size:file.size};}}/>}<ImportContents key={current} test={item.test}/></>:<p>No valid tests found. Review the errors or choose another file.</p>}</main></div>
 <footer><span>Selected tests are imported as new copies. Existing tests are never overwritten.</span><button className="studio-primary" disabled={audioBusy||!selected.size||[...selected].some(i=>!(titles[i]??plan.candidates[i].test.title).trim())} onClick={()=>onConfirm(plan.candidates.flatMap((original,i)=>{const c=edits[i]?{...original,test:edits[i]}:original;return selected.has(i)?[{...c,test:{...c.test,title:(titles[i]??c.test.title).trim(),folderId:validFolder||null,folderPath:folderLocation(validFolder,folders),parts:c.test.parts.length===1&&titles[i]!==undefined?c.test.parts.map(p=>({...p,title:titles[i].trim()})):c.test.parts,status,access:'free' as const}}]:[]}))}>Confirm import {selected.size} tests</button></footer>
 </dialog></div>;
}

