import {auth} from '../firebase';
import {requestJson} from './apiRequest';
export interface StorageConfiguration{provider:'firebase'|'r2';ready:boolean;message:string;bucket?:string}
interface UploadTicket{provider:'r2'|'firebase';exists?:boolean;publicUrl?:string;uploadUrl?:string;headers?:Record<string,string>}
let cached:{uid:string;until:number;value:Promise<StorageConfiguration>}|null=null;
export function storageConfiguration(refresh=false){
 const uid=auth.currentUser?.uid||'';
 if(!refresh&&cached?.uid===uid&&cached.until>Date.now())return cached.value;
 const value=requestJson<StorageConfiguration>('/api/admin/media/config',{},()=>auth.currentUser).catch(error=>{cached=null;throw error});cached={uid,until:Date.now()+60000,value};return value;
}
export function checkMediaStorage(){cached=null;return requestJson<StorageConfiguration>('/api/admin/media/check',{},()=>auth.currentUser)}
export async function uploadToR2(blob:Blob,onProgress?:(sent:number,total:number)=>void):Promise<string|null>{
 if((await storageConfiguration()).provider!=='r2')return null;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
 const ticket=await requestJson<UploadTicket>('/api/admin/media/prepare',{sha256:digest,size:blob.size,contentType:blob.type},()=>auth.currentUser);
 if(ticket.provider!=='r2'||!ticket.publicUrl)throw new Error('[R2_CONFIGURATION_CHANGED] Storage settings changed. Refresh the page and retry.');
 if(!ticket.exists){if(!ticket.uploadUrl)throw new Error('[R2_INVALID_RESPONSE] No upload URL was returned.');await putMedia(blob,ticket.uploadUrl,ticket.headers||{},onProgress)}else onProgress?.(blob.size,blob.size);
 try{const response=await fetch(ticket.publicUrl,{method:'HEAD',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('HTTP '+response.status)}catch{throw new Error('[R2_PUBLIC_ACCESS_FAILED] The file is stored, but its public download URL cannot be read. Check the R2 public domain and CORS GET/HEAD settings. Do not upload another copy; retry after fixing the configuration.');}
 return ticket.publicUrl;
}
export function putMedia(blob:Blob,url:string,headers:Record<string,string>,onProgress?:(sent:number,total:number)=>void,factory:()=>XMLHttpRequest=()=>new XMLHttpRequest()){
 return new Promise<void>((resolve,reject)=>{
  const xhr=factory();let settled=false,sent=-1,timer:ReturnType<typeof setTimeout>;
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve()};
  const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>{finish(new Error('[R2_UPLOAD_TIMEOUT] No transfer progress for 120 seconds. Check your connection and retry.'));xhr.abort()},120000)};
  xhr.open('PUT',url);for(const [key,value]of Object.entries(headers))xhr.setRequestHeader(key,value);
  xhr.upload.onprogress=event=>{if(event.loaded!==sent){sent=event.loaded;reset()}onProgress?.(event.loaded,event.lengthComputable?event.total:blob.size)};
  xhr.onerror=()=>finish(new Error('[R2_UPLOAD_NETWORK] The browser could not upload to R2. Check the bucket CORS policy for this website, then check the connection.'));
  xhr.onabort=()=>finish(new Error('[R2_UPLOAD_CANCELLED] Upload cancelled.'));
  xhr.onload=()=>xhr.status>=200&&xhr.status<300?finish():finish(new Error('[R2_UPLOAD_HTTP_'+xhr.status+'] R2 rejected the upload. Check the token permissions and bucket CORS policy. Refresh the page if the signed URL expired.'));
  reset();try{xhr.send(blob)}catch{finish(new Error('[R2_UPLOAD_NETWORK] Could not start the direct upload. Check the browser connection and R2 CORS settings.'))}
 });
}
