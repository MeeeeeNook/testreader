import React,{useState} from 'react';
import {BookOpen,Menu,ChevronDown,X,History,BookMarked,Folder,Settings2,Layers} from 'lucide-react';
import type {User} from 'firebase/auth';
import type {UserProfile,TestMeta} from '../types';
import {TopHeader} from './TopHeader';
export function PortalHeader({route,user,profile,role,onNavigate,onUpdateProfile,onOpenProfileModal,tests=[]}:{route:string;user:User|null;profile:UserProfile;role:'admin'|'student';onNavigate:(path:string)=>void;onUpdateProfile:(value:Partial<UserProfile>)=>void;onOpenProfileModal:()=>void;tests?:TestMeta[]}){
 const [expanded,setExpanded]=useState(false);
 const link=(e:React.MouseEvent,path:string)=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();setExpanded(false);onNavigate(path);}};
 return <header className="portal-header"><a className="portal-brand" href="/" onClick={e=>link(e,'/')}><span><BookOpen size={25}/></span>IELTS<span className="brand-word">studio</span><span className="brand-dot">.</span></a><button className="portal-menu-button" aria-label="Navigation" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?<X/>:<Menu/>}</button><nav className={'portal-navigation '+(expanded?'is-open':'')} aria-label="Main navigation"><a href="/practice" aria-current={['library','practice'].includes(route)?'page':undefined} onClick={e=>link(e,'/practice')}>Practice Test</a><a href="/full-tests" aria-current={route==='full'?'page':undefined} onClick={e=>link(e,'/full-tests')}>Full Test</a><a href="/history" aria-current={route==='progress'?'page':undefined} onClick={e=>link(e,'/history')}><History size={16}/>Test history</a><a href="/vocabulary" aria-current={route==='vocabulary'?'page':undefined} onClick={e=>link(e,'/vocabulary')}><BookMarked size={16}/>Vocabulary</a></nav><TopHeader crumb="" user={user} profile={profile} role={role} onUpdateProfile={onUpdateProfile} onOpenProfileModal={onOpenProfileModal} onNavigate={onNavigate}/></header>;
}
