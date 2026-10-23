import React,{useState} from 'react';
import {Share2} from 'lucide-react';
import {shareTest} from '../services/shareTest';
export function ShareButton({path,title,compact=false}:{path:string;title:string;compact?:boolean}){
 const [message,setMessage]=useState('');
 return <span className="share-test"><button className={compact?'reader-icon':'studio-secondary'} title="Share test introduction" aria-label="Share test introduction" onClick={()=>{void shareTest(path,title).then(setMessage).catch(e=>setMessage(e.message))}}><Share2 size={18}/>{!compact&&'Share test'}</button>{message&&<span role="status" className="share-message" onClick={()=>setMessage('')}>{message}</span>}</span>;
}
