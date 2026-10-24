import React, {useEffect, useState} from 'react';
import {LayoutDashboard,Folder,Files,Upload,Users,Flag,Archive,Trash2,ArrowUpRight,Search,Menu,X,Palette,GraduationCap} from 'lucide-react';
import {Modal} from './Modal';
import {adminSearch} from '../services/adminTools';
import {STUDENT_ORIGIN} from '../services/siteOrigins';
import type {TestMeta,UserProfile} from '../types';
const groups: {label:string;items:[string,string,typeof Files][]}[]=[{label:'Workspace',items:[['/admin','Overview',LayoutDashboard],['/admin/tests','Test library',Files],['/admin/folders','Folders',Folder],['/admin/upload','Import tests',Upload]]},{label:'People & content',items:[['/admin/students','Students',Users],['/admin/teachers','Teachers',GraduationCap],['/admin/reports','Content reports',Flag],['/admin/website-ui','Website design',Palette]]},{label:'Storage',items:[['/admin/archive','Archive',Archive],['/admin/trash','Trash',Trash2]]}];
export function AdminSidebar({location,onNavigate,tests=[],learners=[],reportCount=0}:{location:string;onNavigate:(path:string)=>void;tests?:TestMeta[];learners?:UserProfile[];reportCount?:number}){
 const path=location.split('?')[0].replace(/\/$/,'');
 const [open,setOpen]=useState(false),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState('');
 useEffect(()=>{setOpen(false);setSearchOpen(false)},[location]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(v=>!v)}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[]);
 const link=(e:React.MouseEvent,url:string)=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();setSearchOpen(false);onNavigate(url)}};
 const matches=adminSearch(tests,learners,query);
 const pages=groups.flatMap(g=>g.items).filter(([,label])=>!query.trim()||label.toLowerCase().includes(query.trim().toLowerCase()));
 return <aside className="admin-sidebar">
 <div className="admin-brand"><span>IELTS STUDIO</span><strong>Admin workspace</strong><small>Manage learning, thoughtfully.</small></div>
 <div className="admin-nav-tools"><button className="admin-search-trigger" onClick={()=>{setQuery('');setSearchOpen(true)}}><Search size={17}/><span>Quick find</span><kbd>Ctrl K</kbd></button><button className="admin-mobile-toggle" aria-label="Toggle navigation" aria-expanded={open} aria-controls="admin-navigation" onClick={()=>setOpen(!open)}>{open?<X size={20}/>:<Menu size={20}/>}</button></div>
 <nav id="admin-navigation" className={open?'is-open':''} aria-label="Admin navigation">{groups.map(g=><section key={g.label}><h2>{g.label}</h2>{g.items.map(([url,label,Icon])=>{const active=path===url||(url==='/admin'&&path==='/admin/overview')||(url==='/admin/tests'&&/^\/admin\/(new|tests\/)/.test(path))||(url==='/admin/students'&&path.startsWith(url+'/'));return <a key={url} href={url} aria-current={active?'page':undefined} onClick={e=>link(e,url)}><Icon size={18}/><span>{label}</span>{url==='/admin/reports'&&reportCount>0&&<b className="admin-nav-count">{reportCount}</b>}</a>})}</section>)}</nav>
 <a className="admin-exit" href={STUDENT_ORIGIN} target="_blank" rel="noopener noreferrer">Open student website <ArrowUpRight size={16}/></a>
 {searchOpen&&<Modal label="Search admin workspace" className="admin-command" onClose={()=>setSearchOpen(false)}><div className="admin-command-heading"><h2>Quick find</h2><button onClick={()=>setSearchOpen(false)} aria-label="Close search"><X size={20}/></button></div><label className="studio-field">Search pages, tests or students<input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Test title, student name or email…"/></label><div className="admin-command-results">{pages.length>0&&<h3>Pages</h3>}{pages.map(([url,label,Icon])=><a key={url} href={url} onClick={e=>link(e,url)}><Icon size={18}/><span>{label}</span><ArrowUpRight size={15}/></a>)}{matches.length>0&&<h3>Tests & students</h3>}{matches.map(m=><a key={m.id} href={m.href} onClick={e=>link(e,m.href)}><span><strong>{m.title}</strong><small>{m.detail}</small></span><ArrowUpRight size={15}/></a>)}{!pages.length&&!matches.length&&<p className="studio-empty">No matches. Try a shorter name or test title.</p>}</div><p className="studio-small">Searches loaded records. Use Tab to choose a result and Enter to open it.</p></Modal>}
 </aside>;
}
