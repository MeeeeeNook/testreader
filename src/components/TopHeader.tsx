import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown,LogIn,LogOut,Settings,History,BookMarked,ShieldCheck,X,UserRound} from 'lucide-react';
import type {User} from 'firebase/auth';
import type {UserProfile} from '../types';
import {logout} from '../services/auth';
interface Props {crumb:string;user:User|null;profile:UserProfile;role:'admin'|'student';onUpdateProfile:(updates:Partial<UserProfile>)=>void;onOpenProfileModal:()=>void;onNavigate?:(path:string)=>void}
export function TopHeader({crumb,user,role,onOpenProfileModal,onNavigate}:Props){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const photo=user?.photoURL||user?.providerData?.find(provider=>provider.providerId==='google.com')?.photoURL;
 const [failedPhoto,setFailedPhoto]=useState('');
 const container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!container.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};},[open]);
 const links=[['/history','My history',History],['/vocabulary','Vocabulary',BookMarked],['/settings','Settings',Settings],...(role==='admin'?[['/admin','Admin workspace',ShieldCheck] as const]:[])] as const;
 return <div className="account-tools" ref={container}>{crumb&&<span className="account-crumb">{crumb}</span>}{user?<button ref={trigger} className="account-trigger" aria-label="Account menu" aria-expanded={open} aria-controls="account-menu" onClick={()=>setOpen(v=>!v)}><span className="account-initials">{photo&&photo!==failedPhoto?<img className="google-avatar" src={photo} alt="Google account avatar" referrerPolicy="no-referrer" onError={()=>setFailedPhoto(photo)}/>:<UserRound size={19}/>}</span><span className="account-name">{user.displayName?.split(' ')[0]||'Account'}</span><ChevronDown size={15}/></button>:<a className="studio-primary sign-in-button" href="/sign-in" onClick={e=>{if(onNavigate&&!e.metaKey&&!e.ctrlKey){e.preventDefault();onNavigate("/sign-in");}}}><LogIn size={17}/>Sign in</a>}
 {error&&<div className="auth-error" role="alert">{error}<button aria-label="Dismiss sign-in error" onClick={()=>setError('')}><X size={16}/></button></div>}
 {open&&user&&<div className="account-menu" id="account-menu"><div className="account-menu-heading"><strong>{user.displayName||'Learner'}</strong><small>{user.email}</small><span>{role==='admin'?'Library owner':'Student'}</span></div><button onClick={()=>{setOpen(false);onOpenProfileModal();}}><UserRound size={17}/>Study profile</button>{links.map(([href,label,Icon])=><a key={href} href={href} onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&onNavigate){e.preventDefault();setOpen(false);onNavigate(href);}}}><Icon size={17}/>{label}</a>)}<button className="account-sign-out" disabled={busy} onClick={async()=>{setBusy(true);try{await logout();setOpen(false);}catch{setError('Could not sign out. Please retry.');}finally{setBusy(false);}}}><LogOut size={17}/>Sign out</button></div>}</div>;
}

