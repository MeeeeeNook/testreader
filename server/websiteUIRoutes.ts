import type {Express,Request,Response} from 'express';
import {AssessmentError} from './assessment';
import {normalizeWebsiteUI} from '../src/services/websiteUI';
export function registerWebsiteUIRoutes(app:Express,authorize:(req:Request)=>Promise<any>,backend:()=>any,fail:(res:Response,e:unknown)=>unknown){
 app.get('/api/website-ui',async(_req,res)=>{try{const doc=await backend().db.doc('site_settings/website_ui').get();res.set('Cache-Control','public, max-age=60, s-maxage=60');res.json(normalizeWebsiteUI(doc.data()))}catch(e){fail(res,e)}});
 app.post('/api/admin/website-ui',async(req,res)=>{try{const user=await authorize(req);if(!user.isAdmin)throw new AssessmentError(403,'Administrator access required.');const settings=normalizeWebsiteUI(req.body);await backend().db.doc('site_settings/website_ui').set(settings);res.json(settings)}catch(e){fail(res,e)}});
}
