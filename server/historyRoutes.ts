import {configuredGradeSigner} from './gradeSignature';
import {FieldPath} from 'firebase-admin/firestore';
import type {Express} from 'express';
import {AssessmentError,loadAssessment,markAssessment,type AssessmentStore} from './assessment';
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[\w-]{1,128}$/.test(id);
export function registerHistoryRoutes(app:Express,caller:any,storeFor:(db:any)=>AssessmentStore,fail:any,signerFor=configuredGradeSigner){
 const trusted=(record:any)=>({...record,serverVerified:signerFor().verify(record)});
 app.post('/api/admin/student-attempts',async(req,res)=>{try{
  const {isAdmin,db}=await caller(req);if(!isAdmin)throw new AssessmentError(403,'Administrator access required.');
  const {targetUserId,id,cursor}=req.body||{};if(!validId(targetUserId)||(id!==undefined&&!validId(id)))throw new AssessmentError(400,'Invalid result identifiers.');
  const collection=db.collection(`users/${targetUserId}/attempts`);
  if(id){const record=await collection.doc(id).get();res.json({attempt:record.exists?trusted(record.data()):null});return;}
  let query=collection.orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
  if(cursor){if(!Number.isSafeInteger(cursor.createdAt)||!validId(cursor.id))throw new AssessmentError(400,'Invalid result page.');query=query.startAfter(cursor.createdAt,cursor.id);}
  const page=await query.limit(26).get(),docs=page.docs.slice(0,25),last=docs.at(-1);
  res.json({attempts:docs.map((doc:any)=>trusted({...doc.data(),id:doc.id})),hasMore:page.docs.length>25,cursor:last?{createdAt:last.data().createdAt,id:last.id}:null});
 }catch(error){fail(res,error);}});
 app.post('/api/history/save' ,async(req,res)=>{try{
  const {identity,isAdmin,db}=await caller(req),body=req.body;
  if(!validId(body?.id)||!validId(body?.testId)||!['practice','exam'].includes(body?.mode))throw new AssessmentError(400,'Invalid result identifiers or mode.');
  const ref=db.doc(`users/${identity.uid}/attempts/${body.id}`),previous=await ref.get();
  if(signerFor().verify(previous.data())){res.json({attempt:previous.data()});return;}
  const limiter=db.doc(`api_limits/history_${identity.uid}`),windowMs=60000;
  await db.runTransaction(async(tx:any)=>{const now=Date.now(),snapshot=await tx.get(limiter),old=snapshot.data(),reset=!old||old.until<=now;if(!reset&&old.count>=30)throw new AssessmentError(429,'Please wait a minute before saving more results. Your result is kept on this device.');tx.set(limiter,{count:reset?1:old.count+1,until:reset?now+windowMs:old.until});});
  const assessment=await loadAssessment(storeFor(db),body,isAdmin);
  const marked=markAssessment(assessment,body.responses),now=Date.now();
  const time=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=now+60000?value:null;
  const completedAt=time(body.completedAt)||time(body.createdAt)||now,startedAt=time(body.startedAt);
  const record:any={id:body.id,owner:identity.uid,testId:body.testId,testTitle:assessment.title,skill:assessment.skill,mode:body.mode,createdAt:completedAt,completedAt,...marked,serverVerified:true,verifiedAt:now};
  if(startedAt&&startedAt<=completedAt)record.startedAt=startedAt;
  if(Number.isSafeInteger(body.elapsedSeconds)&&body.elapsedSeconds>=0&&body.elapsedSeconds<=604800)record.elapsedSeconds=body.elapsedSeconds;
  if(Array.isArray(body.sourceSections))record.sourceSections=body.sourceSections.map(({testId,sectionId}:any)=>({testId,sectionId}));
  else if(Array.isArray(body.sectionIds))record.sectionIds=[...new Set(body.sectionIds)];
  if(validId(body.fullExamId))record.fullExamId=body.fullExamId;
  record.gradeSignature=signerFor().sign(record);
  // An attempt ID is immutable after verification, including concurrent retries.
  const saved=await db.runTransaction(async(tx:any)=>{const snapshot=await tx.get(ref);if(signerFor().verify(snapshot.data()))return snapshot.data();tx.set(ref,record);return record;});
  res.json({attempt:saved});
 }catch(error){fail(res,error);}});
}
