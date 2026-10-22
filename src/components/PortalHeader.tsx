import React, { useState } from 'react';
import { BookOpen, Menu, ChevronDown, Upload, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../types';
import { TopHeader } from './TopHeader';
export function PortalHeader({route,user,profile,role,onNavigate,onUpdateProfile,onOpenProfileModal}: {
 route:string;user:User|null;profile:UserProfile;role:'admin'|'student';onNavigate:(path:string)=>void;onUpdateProfile:(value:Partial<UserProfile>)=>void;onOpenProfileModal:()=>void;
}) {
 const [expanded,setExpanded]=useState(false), vi=profile.language==='vi';
 const link=(e:React.MouseEvent,path:string)=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();setExpanded(false);onNavigate(path);}};
 const a=(path:string,label:string)=> <a href={path} onClick={e=>link(e,path)}>{label}</a>;
 return <header className="portal-header">
  <a className="portal-brand" href="/" onClick={e=>link(e,'/')}><span><BookOpen size={25}/></span>IELTS<span className="brand-word">studio</span><span className="brand-dot">.</span></a>
  <button className="portal-menu-button" aria-label="Navigation" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?<X/>:<Menu/>}</button>
  <nav className={`portal-navigation ${expanded?'is-open':''}`} aria-label="Main navigation">
    <a href="/practice" aria-current={['library','practice'].includes(route)?'page':undefined} onClick={e=>link(e,'/practice')}>Practice Test</a>
    <details className="portal-dropdown" onMouseEnter={e=>{if(window.matchMedia("(hover:hover)").matches)e.currentTarget.open=true;}} onMouseLeave={e=>{if(window.matchMedia("(hover:hover)").matches&&!e.currentTarget.contains(document.activeElement))e.currentTarget.open=false;}}><summary>Full Test <ChevronDown size={13}/></summary><div className="portal-dropdown-content">{a('/full-tests','All full tests')}{a('/full-tests/forecast','Forecast')}{a('/full-tests/vol','VOL')}{a('/full-tests/cambridge','Cambridge')}{a('/mock',vi?'Tự tạo đề / Mix test':'Create a mix test')}</div></details>
    <details className="portal-dropdown" onMouseEnter={e=>{if(window.matchMedia("(hover:hover)").matches)e.currentTarget.open=true;}} onMouseLeave={e=>{if(window.matchMedia("(hover:hover)").matches&&!e.currentTarget.contains(document.activeElement))e.currentTarget.open=false;}}><summary>{vi?'Chia sẻ kiến thức':'Learn'} <ChevronDown size={13}/></summary><div className="portal-dropdown-content knowledge-menu">{['0-5','5-6.5','6.5-8'].map(level=><div key={level}><strong>Level {level}</strong>{['vocabulary','grammar','listening','reading','speaking','writing'].map(skill=><a key={skill} href={`/knowledge?level=${level}&skill=${skill}`} onClick={e=>link(e,`/knowledge?level=${level}&skill=${skill}`)}>{skill[0].toUpperCase()+skill.slice(1)}</a>)}</div>)}<div><strong>{vi?'Khám phá':'Explore'}</strong>{a('/knowledge',vi?'Tất cả bài viết':'All guides')}{a('/knowledge?skill=resources',vi?'Tài liệu học':'Study resources')}</div></div></details>
    <a href="/forum" onClick={e=>link(e,'/forum')}>Forum <small className="coming-chip">Soon</small></a>
    <a href="/contribute" className="contribute-link" onClick={e=>link(e,'/contribute')}><Upload size={15}/>{vi?'Đóng góp':'Contribute'}</a>
  </nav>
  <TopHeader crumb="" user={user} profile={profile} role={role} onUpdateProfile={onUpdateProfile} onOpenProfileModal={onOpenProfileModal}/>
 </header>;
}
