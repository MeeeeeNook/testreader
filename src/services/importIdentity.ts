import type {EditableTest,TestMeta} from '../types';
import {createId} from './ids';
function stable(value:unknown):unknown{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return value;}
export async function contentHash(test:EditableTest,media=new Map<string,string>()):Promise<string>{
 const replace=(value:string)=>{for(const [url,digest]of media)value=value.split(url).join('asset:'+digest);return value.replace(/\r\n/g,'\n').replace(/>\s+</g,'><').trim();};
 const parts=test.parts.map(p=>({passage:replace(p.passageHtml),questions:replace(p.questionHtml),slots:p.slots,keys:p.questions.map(q=>({number:q.number,kind:q.kind,answer:q.answer,explanation:replace(q.explanationHtml||''),quote:q.referenceQuote||'',missing:!!q.missing})),audio:replace(p.audio||''),audioStart:p.audioStart||0,audioEnd:p.audioEnd||null}));
 const canonical=JSON.parse(JSON.stringify({skill:test.skill,parts},(_key,value)=>typeof value==="string"?replace(value):value));
 const value=new TextEncoder().encode(JSON.stringify(stable(canonical)));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function mediaDigests(images:{url:string;blob:Blob}[]){return new Map(await Promise.all(images.map(async image=>[image.url,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await image.blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')] as const)));}
export function contentMatch(hash:string,catalog:TestMeta[]){return catalog.find(t=>!t.deletedAt&&t.contentHash===hash);}
export function newImportIdentity(test:EditableTest,hash:string):EditableTest {return {...test,id:'test_'+createId(),contentHash:hash,createdAt:Date.now(),updatedAt:Date.now()};}

