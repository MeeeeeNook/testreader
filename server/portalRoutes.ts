import { answerPath } from "../src/services/portal";
import type { Express } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { AssessmentError } from './assessment';
import { escapeHtml, publicPage, solutionBody, textMarkup } from './publicPages';
const idValid=(id:unknown): id is string=>typeof id==='string'&&/^[\w-]{1,128}$/.test(id);
const articleSkills=['vocabulary','grammar','reading','listening','speaking','writing','resources'];
export function validateContribution(body:any) {
 if (!body || !Array.isArray(body.tests) || !body.tests.length || body.tests.length>20) throw new AssessmentError(400,'Upload between 1 and 20 test records.');
 if (typeof body.title!=='string'||body.title.trim().length<3||body.title.length>200) throw new AssessmentError(400,'Enter a title between 3 and 200 characters.');
 if (body.tests.some((test:any)=>!test || !Array.isArray(test.parts)||!test.parts.length||test.parts.some((p:any)=>!p || typeof p.passageHtml!=='string'||typeof p.questionHtml!=='string'||!Array.isArray(p.questions)))) throw new AssessmentError(400,'The uploaded test content is incomplete.');
 const content=JSON.stringify(body.tests);
 if(Buffer.byteLength(content,'utf8')>700000) throw new AssessmentError(400,'This contribution is too large. Upload a smaller test ZIP (under 700 KB after conversion).');
 return {title:body.title.trim(),content,notes:String(body.notes||'').slice(0,2000),digest:createHash('sha256').update(JSON.stringify(body.tests.map((t:any)=>t.parts))).digest('hex')};
}
export function registerPortalRoutes(app:Express,{caller,backend,apiError}:any) {
 const admin=async(req:any)=>{const c=await caller(req);if(!c.isAdmin)throw new AssessmentError(403,'Administrator access required.');return c;};
 app.post('/api/contributions/create',async(req,res)=>{try {
  const {identity,db}=await caller(req), item=validateContribution(req.body);
  const pending=await db.collection('contributions').where('owner','==',identity.uid).limit(30).get();
  if(pending.docs.filter((d:any)=>d.data().status==='pending').length>=3)throw new AssessmentError(429,'You already have three contributions awaiting review.');
  const ref=db.doc(`contributions/${item.digest}`);
  const {digest,...record}=item;
  await ref.create({...record,id:item.digest,owner:identity.uid,email:identity.email||'',status:'pending',createdAt:Date.now()});
  res.json({id:item.digest,status:'pending'});
 }catch(error){if((error as any)?.code===6)return res.status(409).json({error:'This content has already been submitted. Each contribution only needs to be submitted once.'});apiError(res,error);}});
 app.post('/api/contributions/mine',async(req,res)=>{try {const {identity,db}=await caller(req);const snap=await db.collection('contributions').where('owner','==',identity.uid).limit(30).get();res.json({items:snap.docs.map((d:any)=>{const {content,...item}=d.data();return item;}).sort((a:any,b:any)=>b.createdAt-a.createdAt)});}catch(e){apiError(res,e);}});
 app.post('/api/admin/contributions',async(req,res)=>{try {const {db}=await admin(req);const snap=await db.collection('contributions').where('status','==','pending').limit(30).get();res.json({items:snap.docs.map((d:any)=>d.data()).sort((a:any,b:any)=>a.createdAt-b.createdAt)});}catch(e){apiError(res,e);}});
 app.post('/api/admin/contributions/review',async(req,res)=>{try {
  const {db,identity}=await admin(req);const {id,decision}=req.body;
  if(!idValid(id)||!['approved','rejected'].includes(decision))throw new AssessmentError(400,'Invalid review decision.');
  await db.runTransaction(async(tx:any)=>{
   const ref=db.doc(`contributions/${id}`), snap=await tx.get(ref), item=snap.data();
   if(!item)throw new AssessmentError(404,'Contribution not found.');
   if(item.status!=='pending')throw new AssessmentError(409,'This contribution has already been reviewed.');
   tx.update(ref,{status:decision,reviewer:identity.uid,reviewedAt:Date.now(),feedback:String(req.body.feedback||'').slice(0,1000)});
  });res.json({status:decision});
 }catch(e){apiError(res,e);}});
 app.post('/api/knowledge/list',async(req,res)=>{try {const {db}=backend();const snap=await db.collection('articles').where('status','==','published').limit(60).get();res.json({items:snap.docs.map((d:any)=>{const {bodyText,...item}=d.data();return item;}).sort((a:any,b:any)=>b.updatedAt-a.updatedAt)});}catch(e){apiError(res,e);}});
 app.post('/api/admin/articles/list',async(req,res)=>{try{const {db}=await admin(req);const snap=await db.collection('articles').limit(100).get();res.json({items:snap.docs.map((d:any)=>d.data())});}catch(e){apiError(res,e);}});
 app.post('/api/admin/articles/save',async(req,res)=>{try {
  const {db}=await admin(req), b=req.body;
  if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||typeof b.bodyText!=='string'||!b.bodyText.trim()||b.bodyText.length>100000||!articleSkills.includes(b.skill)||!['0-5','5-6.5','6.5-8'].includes(b.level)||!['draft','published'].includes(b.status))throw new AssessmentError(400,'Enter a title, content, level, category and publication status.');
  const id=idValid(b.id)?b.id:randomUUID(), slug=String(b.slug||b.title).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,100)||id;
  await db.doc(`articles/${id}`).set({id,title:b.title.trim(),bodyText:b.bodyText,excerpt:String(b.excerpt||b.bodyText.slice(0,180)).slice(0,250),skill:b.skill,level:b.level,status:b.status,slug,updatedAt:Date.now()});res.json({id});
 }catch(e){apiError(res,e);}});
 app.post('/api/admin/articles/delete',async(req,res)=>{try{const {db}=await admin(req);if(!idValid(req.body.id))throw new AssessmentError(400,'Invalid article.');await db.doc(`articles/${req.body.id}`).delete();res.json({deleted:true});}catch(e){apiError(res,e);}});
 app.get('/knowledge/:id/:slug',async(req,res)=>{try {
  if(!idValid(req.params.id))return res.status(404).send('Article not found');
  const {db}=backend(), snap=await db.doc(`articles/${req.params.id}`).get(), item=snap.data();
  if(!item||item.status!=='published')return res.status(404).send('Article not found');
  res.set('Cache-Control','public, max-age=300').type('html').send(publicPage(item.title,item.excerpt,`<p><a href="/knowledge">Kiến thức</a> / ${escapeHtml(item.skill)} · Level ${escapeHtml(item.level)}</p><article><h1>${escapeHtml(item.title)}</h1>${textMarkup(item.bodyText)}</article>`,`/knowledge/${encodeURIComponent(item.id)}/${encodeURIComponent(item.slug)}`));
 }catch(e){res.status(503).set('Retry-After','60').send('This article is temporarily unavailable. Please retry.');}});
 app.get('/answers/:testId/:sectionId/:slug',async(req,res)=>{try {
  const {testId,sectionId}=req.params;
  if(!idValid(testId)||!(sectionId==='all'||idValid(sectionId)))return res.status(404).send('Test not found');
  const {db}=backend(), snap=await db.doc(`tests/${testId}`).get(), meta=snap.data();
  if(!meta||meta.status!=='published')return res.status(404).send('Test not found');
  const sections=(meta.sectionSummaries||[]).filter((p:any)=>sectionId==='all'||p.id===sectionId);
  if(sectionId!=='all'&&!sections.length)return res.status(404).send('Passage not found. Open the test from the library.');
  const selected=sectionId==='all'?[]:sections;
  const title=selected.length===1?selected[0].title:meta.title;
  res.set('Cache-Control','public, max-age=300').type('html').send(publicPage(`${title} ${meta.skill==='reading'?'Reading':'Listening'} Answers`,`Practise ${title} and submit to review answers.`,solutionBody({...meta,id:testId},selected),answerPath(testId,sectionId,title)));

 }catch(e){res.status(503).set('Retry-After','60').send('Solutions are temporarily unavailable. Please retry.');}});
 let sitemapCache:{until:number;xml:string}|undefined;
 app.get('/sitemap.xml',async(req,res)=>{try {
  if(sitemapCache&&Date.now()<sitemapCache.until)return res.type('xml').send(sitemapCache.xml);
  const origin=process.env.PUBLIC_SITE_URL;
  if(!origin||!/^https:\/\/[^/]+\/?$/.test(origin))return res.status(503).send('Set PUBLIC_SITE_URL to the deployed HTTPS origin.');
  const {db}=backend(), snap=await db.collection('tests').where('status','==','published').limit(3000).get();
  const urls=['/','/practice','/full-tests','/knowledge'];
  for(const d of snap.docs){const t=d.data();urls.push(answerPath(d.id,"all",t.title));for(const p of t.sectionSummaries||[])urls.push(answerPath(d.id,p.id,p.title));}
  const articles=await db.collection('articles').where('status','==','published').limit(1000).get();
  for(const d of articles.docs)urls.push(`/knowledge/${d.id}/${d.data().slug}`);
  const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(path=>`<url><loc>${escapeHtml(origin.replace(/\/$/,'')+path)}</loc></url>`).join('')}</urlset>`;
  sitemapCache={until:Date.now()+3600000,xml};res.set('Cache-Control','public,max-age=3600').type('xml').send(xml);
 }catch(e){res.status(503).send('Sitemap temporarily unavailable.');}});
 app.get('/robots.txt',(_req,res)=>res.type('text').send(`User-agent: *\nDisallow: /admin\nDisallow: /history\nDisallow: /api/\n${process.env.PUBLIC_SITE_URL?'Sitemap: '+process.env.PUBLIC_SITE_URL.replace(/\/$/,'')+'/sitemap.xml':''}`));
}
