import {humanTestSlug} from '../src/services/testUrls.js';
import {createHash} from 'node:crypto';
export async function ensureTestUrl(db,testId,title){
 if(!/^[\w-]{1,128}$/.test(testId)||typeof title!=='string'||!title.trim()||title.length>250)throw Object.assign(Error('Invalid test URL request.'),{status:400});
 return db.runTransaction(async tx=>{
  const metaRef=db.doc('tests/'+testId),idRef=db.doc('test_url_ids/'+testId);
  const [meta,saved]=await Promise.all([tx.get(metaRef),tx.get(idRef)]);
  const preferred=saved.data()?.slug||meta.data()?.slug;
  const base=humanTestSlug(title),suffix=createHash('sha256').update(testId).digest('hex').slice(0,8);
  let slug=preferred||base,routeRef,snapshot;
  for(let i=0;i<10;i++){
   routeRef=db.doc('test_urls/'+slug);snapshot=await tx.get(routeRef);
   if(!snapshot.exists||snapshot.data()?.testId===testId)break;
   slug=base+'-'+suffix+(i?'-'+(i+1):'');
  }
  if(snapshot?.exists&&snapshot.data()?.testId!==testId)throw Error('Could not reserve a unique test URL.');
  if(!snapshot?.exists)tx.set(routeRef,{testId,createdAt:Date.now()});
  if(saved.data()?.slug!==slug)tx.set(idRef,{slug});
  if(meta.exists&&meta.data()?.slug!==slug)tx.update(metaRef,{slug});
  return slug;
 });
}
export async function resolvePublicTest(db,reference,allowPrivate=false){
 if(typeof reference!=='string'||!reference||reference.length>220||!/^[\w-]+$/.test(reference))return null;
 const route=await db.doc('test_urls/'+reference).get();
 const id=route.data()?.testId||reference;
 const doc=await db.doc('tests/'+id).get(),meta=doc.data();
 if(!meta||(!allowPrivate&&(meta.status!=='published'||meta.deletedAt)))return null;
 return {...meta,id:doc.id||id};
}
