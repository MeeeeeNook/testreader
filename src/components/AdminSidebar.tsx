import React from 'react';
import {LayoutDashboard,Folder,Files,Upload,Users,Flag,Archive,Trash2,FileText,Inbox,ArrowLeft} from 'lucide-react';
const groups=[{label:'LIBRARY',items:[['/admin','Overview',LayoutDashboard],['/admin/folders','Folders',Folder],['/admin/tests','Tests',Files],['/admin/upload','Upload & Import',Upload]]},{label:'MANAGEMENT',items:[['/admin/students','Students & attempts',Users],['/admin/reports','Content reports',Flag],['/admin/content','Articles',FileText],['/admin/contributions','Contributions',Inbox]]},{label:'STORAGE',items:[['/admin/archive','Archive',Archive],['/admin/trash','Trash',Trash2]]}] as const;
export function AdminSidebar({location,onNavigate}:{location:string;onNavigate:(path:string)=>void}){
 const path=location.split('?')[0].replace(/\/$/,'');
 const link=(e:React.MouseEvent,url:string)=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onNavigate(url);}};
 return <aside className="admin-sidebar"><div className="admin-brand"><span>IELTS STUDIO</span><strong>Library administration</strong><small>OWNER WORKSPACE</small></div><nav aria-label="Admin navigation">{groups.map(g=><section key={g.label}><h2>{g.label}</h2>{g.items.map(([url,label,Icon])=>{const active=path===url||(url==='/admin'&&path==='/admin/overview')||(url==='/admin/tests'&&/^\/admin\/(new|tests\/)/.test(path))||(url==='/admin/students'&&path.startsWith(url+'/'));return <a key={url} href={url} aria-current={active?'page':undefined} onClick={e=>link(e,url)}><Icon size={18}/><span>{label}</span></a>;})}</section>)}</nav><a className="admin-exit" href="/practice" onClick={e=>link(e,'/practice')}><ArrowLeft size={17}/> Back to practice</a></aside>;
}

