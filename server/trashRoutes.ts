import type {Express,Request,Response} from 'express';
import {AssessmentError} from './assessment';
import {readR2Config,objectUrl,presign,MediaStorageError,type R2Config} from './r2Storage';
// Only objects created by our content-addressed uploader can be removed.
export function managedMedia(value:unknown,config:R2Config|null,bucketName:string):Set<string>{
 const found=new Set<string>();
 const walk=(v:unknown)=>{
  if(typeof v==='string')for(const raw of v.match(/https:\/\/[^\s<>"']+/g)||[]){
   try{const url=new URL(raw.replace(/&amp;/g,'&'));if(config&&url.origin===new URL(config.publicUrl).origin&&url.pathname.startsWith(new URL(config.publicUrl).pathname.replace(/\/$/,'')+'/')){const prefix=new URL(config.publicUrl).pathname.replace(/\/$/,'')+'/';const key=decodeURIComponent(url.pathname.slice(prefix.length));if(/^(audio|images)\/[a-f0-9]{64}\.[a-z0-9]{2,5}$/.test(key))found.add('r2:'+key)}
    const match=/^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname);if(url.hostname==='firebasestorage.googleapis.com'&&match&&decodeURIComponent(match[1])===bucketName){const key=decodeURIComponent(match[2]);if(/^(?:media\/(?:audio|images)\/|tests\/[\w-]+\/images\/)/.test(key)&&!key.includes('..'))found.add('firebase:'+key)}
   }catch{}
  }else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);
 };walk(value);return found;
}
export function unreferencedMedia(target:Set<string>,others:Set<string>){return [...target].filter(key=>!others.has(key))}
export function registerTrashRoutes(app:Express,authorize:(req:Request)=>Promise<any>,backend:()=>any,fail:(res:Response,e:unknown)=>unknown){
 app.post('/api/admin/trash-delete',async(req,res)=>{try{
  const caller=await authorize(req);if(!caller.isAdmin)throw new AssessmentError(403,'Administrator access required.');
  const values=Array.isArray(req.body?.testIds)?req.body.testIds:[req.body?.testId];
  if(!values.length||values.length>25||values.some((id:unknown)=>typeof id!=='string'||!/^[-\w]{1,128}$/.test(id))||req.body.confirm!=='DELETE')throw new AssessmentError(400,'Choose up to 25 trashed tests and confirm permanent deletion.');
  const ids=new Set<string>(values),{db,bucket}=backend();
  const config=readR2Config();
  // A lease prevents two cleanup requests from deleting a shared file concurrently.
  const lock=db.doc('site_settings/trash_cleanup'),lease=Date.now()+120000;
  await db.runTransaction(async(tx:any)=>{const current=await tx.get(lock);if((current.data()?.until||0)>Date.now())throw new AssessmentError(409,'Another cleanup is running. Please retry shortly.');tx.set(lock,{until:lease})});
  try{
   const [all,parts,keys]=await Promise.all([db.collection('tests').get(),db.collectionGroup('sections').get(),db.collection('test_keys').get()]),target=new Set<string>(),others=new Set<string>();
   const selected=all.docs.filter((d:any)=>ids.has(d.id));
   if(selected.some((d:any)=>!d.data()?.deletedAt))throw new AssessmentError(409,'Only tests in Trash can be permanently deleted.');
   const retainedIds=new Set(all.docs.map((d:any)=>d.id));
   const collect=(testId:string,data:unknown)=>{if(!retainedIds.has(testId))return;for(const key of managedMedia(data,config,bucket.name))(ids.has(testId)?target:others).add(key)};
   // Read metadata, public parts and private transcript images for every retained test,
   // including archived, draft and other trashed tests.
   for(const test of all.docs)collect(test.id,test.data());
   for(const part of parts.docs){const match=/^tests\/([^/]+)\/sections\/[^/]+$/.exec(part.ref.path);if(match)collect(match[1],part.data())}
   for(const key of keys.docs)collect(key.id,key.data());
   let deletedMedia=0;const deadline=Date.now()+20000;
   for(const media of unreferencedMedia(target,others)){
    if(Date.now()>deadline)throw new AssessmentError(503,'Cleanup is taking longer than expected. Some unused files are already removed; retry to finish permanent deletion.');
    try{
    if(media.startsWith('r2:')&&config){const response=await fetch(presign(objectUrl(config,media.slice(3)),'DELETE',config),{method:'DELETE',signal:AbortSignal.timeout(8000)});if(!response.ok&&response.status!==404)throw new AssessmentError(503,'Media cleanup failed (R2 HTTP '+response.status+'). Cleanup may be partial. Retry to finish permanent deletion.');}
    else await bucket.file(media.slice(9)).delete({ignoreNotFound:true});
    }catch(e){if(e instanceof AssessmentError)throw e;throw new AssessmentError(503,'Storage cleanup could not finish. Check your storage connection and permissions, then retry permanent deletion.')}
    deletedMedia++;
   }
   for(const test of selected){await db.doc('test_keys/'+test.id).delete();await db.recursiveDelete(db.doc('tests/'+test.id));}
   res.json({success:true,deletedTestIds:selected.map((d:any)=>d.id),deletedMedia,retainedSharedMedia:target.size-unreferencedMedia(target,others).length});
  }finally{await db.runTransaction(async(tx:any)=>{const current=await tx.get(lock);if(current.data()?.until===lease)tx.delete(lock)})}
 }catch(e){fail(res,e instanceof MediaStorageError?new AssessmentError(e.status,e.message):e)}});
}
