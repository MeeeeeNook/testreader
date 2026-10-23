import type {Express,Request,Response} from 'express';
import {AssessmentError} from './assessment';
const valid=(uid:unknown):uid is string=>typeof uid==='string'&&/^[\w-]{1,128}$/.test(uid);
export function registerStudentRoutes(app:Express,authorize:(req:Request)=>Promise<any>,backend:()=>any,fail:(res:Response,e:unknown)=>unknown){
 const owner=async(req:Request)=>{const caller=await authorize(req);if(!caller.isAdmin)throw new AssessmentError(403,'Administrator access required.');if(!valid(req.body.targetUserId))throw new AssessmentError(400,'Invalid student ID.');return caller};
 app.post('/api/admin/student-details',async(req,res)=>{try{await owner(req);const user=await backend().auth.getUser(req.body.targetUserId);res.json({uid:user.uid,email:user.email||'',createdAt:Date.parse(user.metadata.creationTime)||null,lastSignInAt:Date.parse(user.metadata.lastSignInTime)||null,disabled:user.disabled,emailVerified:user.emailVerified,providers:user.providerData.map((p:any)=>p.providerId)})}catch(e){fail(res,e)}});
 app.post('/api/admin/student-delete',async(req,res)=>{try{
  const caller=await owner(req),{auth,db}=backend(),uid=req.body.targetUserId;
  const user=await auth.getUser(uid);
  if(uid===caller.identity.uid||user.email?.toLowerCase()==='manhcuong2006ht@gmail.com')throw new AssessmentError(403,'The owner account cannot be deleted.');
  if(!user.email||req.body.confirmEmail!==user.email)throw new AssessmentError(400,'Type the student email exactly to confirm deletion.');
  const ref=db.doc('users/'+uid);
  await ref.set({id:uid,status:'suspended',updatedAt:Date.now()},{merge:true});
  await auth.updateUser(uid,{disabled:true});await auth.revokeRefreshTokens(uid);
  for(const name of ['attempts','vocabulary'])await db.recursiveDelete(ref.collection(name));
  await auth.deleteUser(uid);
  // Retain only a minimal access block so an old ID token cannot recreate the profile.
  await ref.set({id:uid,status:'suspended',deletedAt:Date.now()});
  res.json({success:true,uid});
 }catch(e){fail(res,e)}});
}
