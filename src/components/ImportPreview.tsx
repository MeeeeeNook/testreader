import React,{useState,useEffect,useRef} from 'react';
import type {ImportPlan,ImportCandidate} from '../services/importPreview';
import {auditTest} from '../services/testAudit';
import {folderPath} from '../services/catalog';
export function ImportPreview({plan,existingIds,onCancel,onConfirm}:{plan:ImportPlan;existingIds:Set<string>;onCancel:()=>void;onConfirm:(items:ImportCandidate[])=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=dialog.current;if(!el)return;if(typeof el.showModal==='function')el.showModal();else el.setAttribute('open','');},[]);
 const [selected,setSelected]=useState(()=>new Set(plan.candidates.map((_,i)=>i)));
 const [titles,setTitles]=useState<Record<number,string>>({});
 const [folder,setFolder]=useState('');const [status,setStatus]=useState<'draft'|'published'>('draft');
 const [current,setCurrent]=useState(0);const [query,setQuery]=useState('');
 const seen=new Set<string>();const duplicates=plan.candidates.filter(c=>{const dupe=existingIds.has(c.test.id)||seen.has(c.test.id);seen.add(c.test.id);return dupe;}).length;
 const visible=plan.candidates.map((c,index)=>({...c,index})).filter(c=>`${c.test.title} ${c.name}`.toLowerCase().includes(query.toLowerCase()));
 const item=plan.candidates[current];
 return <div className="import-preview-backdrop"><dialog ref={dialog} onCancel={e=>{e.preventDefault();onCancel();}} aria-label="Import preview" className="import-preview">
 <header><div><span className="studio-eyebrow">LOCAL PREVIEW · NOTHING IMPORTED YET</span><h2>Import preview</h2><p>{plan.candidates.length} tests · {plan.images.length} images · {duplicates} potential duplicate IDs · {plan.errors.length} file errors</p></div><button onClick={onCancel} className="studio-secondary">Cancel import</button></header>
 <div className="import-preview-options"><label>Destination folder (leave blank to keep source folders)<input aria-label="Import folder" value={folder} onChange={e=>setFolder(e.target.value)} placeholder="Forecast / Q3"/></label><label>Status after import<select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="draft">Draft</option><option value="published">Published</option></select></label></div>
 {duplicates>0&&<p className="studio-callout">Existing complete tests are skipped. Legacy tests with missing answer controls can be repaired while preserving their settings.</p>}
 {plan.errors.length>0&&<details className="import-errors"><summary>File errors ({plan.errors.length})</summary><ul>{plan.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></details>}
 <div className="import-preview-body"><aside><input aria-label="Search preview" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search test or file name…"/><div className="import-selection"><button onClick={()=>setSelected(new Set(visible.map(c=>c.index)))}>Select filtered results</button><button onClick={()=>setSelected(new Set())}>Clear selection</button><span>{selected.size} selected</span></div>
 <div className="import-candidate-list">{visible.map(({test,name,index})=><div key={index} className={index===current?'active':''}><input type="checkbox" aria-label={`Import ${test.title}`} checked={selected.has(index)} onChange={e=>setSelected(prev=>{const next=new Set(prev);e.target.checked?next.add(index):next.delete(index);return next;})}/><button onClick={()=>setCurrent(index)}><strong>{titles[index]??test.title}</strong><small>{test.parts.length} passage · {test.parts.reduce((n,p)=>n+p.questions.length,0)} questions{existingIds.has(test.id)?' · Existing ID':''}</small><small>{name}</small></button></div>)}</div></aside>
 <main>{item?<><label>Test title<input aria-label="Preview test title" value={titles[current]??item.test.title} onChange={e=>setTitles({...titles,[current]:e.target.value})}/></label><p>{folderPath(folder)||item.test.source} · {item.test.skill} · {item.test.duration} min</p>
 {auditTest(item.test).length>0&&<details><summary>Needs review ({auditTest(item.test).length})</summary><ul>{auditTest(item.test).map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>}
 {item.test.parts.map((p,i)=><details key={p.id} open={i===0}><summary><small>Passage {p.position||i+1}</small> · {p.title} · {p.questions.length} questions</summary><iframe title={`Preview ${p.title}`} sandbox="" srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data: https:; style-src 'unsafe-inline'"><style>body{font:18px/1.7 Georgia;color:#111;padding:12px}img{max-width:100%}input,select{font:inherit;max-width:100%}</style>${p.passageHtml}<hr>${p.questionHtml}`}/><p>{p.questions.filter(q=>q.answer?.trim()).length}/{p.questions.length} questions with keys · {p.questions.filter(q=>q.explanationHtml?.trim()).length} with explanations</p></details>)}</>:<p>No valid tests found. Review the errors or choose another file.</p>}</main></div>
 <footer><span>Images and tests are only saved after confirmation.</span><button className="studio-primary" disabled={!selected.size||[...selected].some(i=>!(titles[i]??plan.candidates[i].test.title).trim())} onClick={()=>onConfirm(plan.candidates.flatMap((c,i)=>selected.has(i)?[{...c,test:{...c.test,title:(titles[i]??c.test.title).trim(),source:folderPath(folder)||c.test.source,parts:c.test.parts.length===1&&titles[i]!==undefined?c.test.parts.map(p=>({...p,title:titles[i].trim()})):c.test.parts,status,access:'free' as const}}]:[]))}>Confirm import {selected.size} tests</button></footer>
 </dialog></div>;
}

