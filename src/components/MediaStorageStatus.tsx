import React,{useState} from 'react';
import {checkMediaStorage,type StorageConfiguration} from '../services/mediaStorage';
export function MediaStorageStatus(){
 const [result,setResult]=useState<StorageConfiguration|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const check=async()=>{setBusy(true);setError('');try{setResult(await checkMediaStorage())}catch(error){setResult(null);setError((error as Error).message)}finally{setBusy(false)}};
 return <section className="studio-panel" aria-label="Media storage connection"><div className="studio-heading-line"><h2>Audio & image storage</h2><button className="studio-secondary" disabled={busy} onClick={()=>void check()}>{busy?'Checking storage...':'Check storage connection'}</button></div><p>R2 is used when configured on the server. Firebase still handles sign-in and test data. Audio is compressed before upload.</p>{result&&<p role="status"><strong>{result.provider==='r2'?'Cloudflare R2':'Firebase Storage'}:</strong> {result.message}</p>}{error&&<div role="alert"><p>{error}</p><textarea aria-label="Storage error details" className="import-error-details" value={error} readOnly onFocus={event=>event.target.select()}/><button className="quiet-button" onClick={()=>void navigator.clipboard.writeText(error).catch(()=>{})}>Copy storage error</button></div>}</section>;
}
