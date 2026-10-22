import React,{useState} from 'react';
import {HardDrive,RefreshCw} from 'lucide-react';
import {auth} from '../firebase';
import {requestJson} from '../services/apiRequest';
import {firestoreAdapter} from '../services/firestoreAdapter';
import {formatBytes} from '../services/storageUsage';
import type {TestMeta} from '../types';

interface Inventory {bytes:number;count:number;scannedAt:number;largest:{name:string;size:number}[];truncated:boolean}
export function StorageOverview({tests}:{tests:TestMeta[]}) {
  const [inventory,setInventory]=useState<Inventory|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [measured,setMeasured]=useState<Record<string,number>>({}),[progress,setProgress]=useState(''),[rate,setRate]=useState('');
  const known=tests.filter(t=>measured[t.id]!==undefined||t.contentBytes!==undefined);
  const bytes=known.reduce((sum,t)=>sum+(measured[t.id]??t.contentBytes??0),0);
  const scan=async()=>{
    setBusy(true);setError('');
    try{setInventory(await requestJson('/api/admin/storage-usage',{},()=>auth.currentUser));}
    catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  };
  const measure=async()=>{
    setBusy(true);setError('');
    try{let done=0;for(const test of tests){setProgress(`Measuring ${++done} / ${tests.length}`);const full=await firestoreAdapter.getTestComplete(test.id);const size=new TextEncoder().encode(JSON.stringify(full)).length;await firestoreAdapter.updateTestMeta(test.id,{contentBytes:size});setMeasured(prev=>({...prev,[test.id]:size}));}}
    catch(e){setError((e as Error).message);}finally{setBusy(false);setProgress('');}
  };
  return <section className="studio-panel storage-overview"><div className="storage-heading"><div><h2><HardDrive size={22}/> Resource storage</h2><p>See what your tests and uploaded media use.</p></div><button className="studio-secondary" disabled={busy} onClick={()=>void scan()}><RefreshCw size={16}/>Check uploaded files</button></div>
    <div className="storage-stats"><div><small>Uploaded images and audio</small><strong>{inventory?formatBytes(inventory.bytes):'Not checked'}</strong><span>{inventory?`${inventory.count} files${inventory.truncated?' · partial scan':''}`:'Firebase Storage bucket'}</span></div><div><small>Test content estimate</small><strong>{known.length?formatBytes(bytes):'Not measured'}</strong><span>{known.length} / {tests.length} tests measured · includes embedded images</span></div></div>
    <p>Test content is the UTF-8 size of saved passages, questions and solutions. Firestore indexes and document overhead are additional. Bucket totals include unused uploads and files in Trash.</p>
    <button className="quiet-button" disabled={busy} onClick={()=>void measure()}>Measure existing test content</button><small> Runs only when clicked; reads test sections and keys once, then saves the estimate.</small>
    {progress&&<p role="status">{progress}</p>}{busy&&!progress&&<p role="status">Checking storage…</p>}{error&&<p role="alert">{error}</p>}
    {inventory&&<><label className="studio-field storage-rate">Your storage rate per GiB / month (optional)<input type="number" min="0" step="0.001" placeholder="Enter the rate from your Firebase bill" value={rate} onChange={e=>setRate(e.target.value)}/></label>{rate!==''&&Number(rate)>=0&&<p>Uploaded file storage estimate: <strong>{(inventory.bytes/1024**3*Number(rate)).toFixed(4)}</strong> / month, in your rate’s currency. Before allowances, taxes, downloads and operations. This is not your Firebase bill.</p>}<p><small>Checked {new Date(inventory.scannedAt).toLocaleString()}{inventory.truncated?' · Scan limit reached; totals are a lower bound.':''}</small></p><details><summary>Largest uploaded files</summary><table className="studio-table"><thead><tr><th>File</th><th>Size</th></tr></thead><tbody>{inventory.largest.map(file=><tr key={file.name}><td>{file.name}</td><td>{formatBytes(file.size)}</td></tr>)}</tbody></table></details></>}
    {!!known.length&&<details><summary>Storage by test</summary><table className="studio-table"><thead><tr><th>Test</th><th>Content estimate</th></tr></thead><tbody>{[...known].sort((a,b)=>(measured[b.id]??b.contentBytes??0)-(measured[a.id]??a.contentBytes??0)).map(test=><tr key={test.id}><td>{test.title}</td><td>{formatBytes(measured[test.id]??test.contentBytes??0)}</td></tr>)}</tbody></table></details>}
  </section>;
}
