import type {Express} from 'express';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ensureTestUrl,resolvePublicTest} from './testUrlRegistry.mjs';
import {testIntroductionPath,visibleTestSource} from '../src/services/testUrls.js';
import {escapeHtml} from './publicPages';
import {STUDENT_ORIGIN} from '../src/services/siteOrigins';
import {AssessmentError} from './assessment';
let shell:Promise<string>|undefined;
export function renderTestIntroduction(template:string,test:any,reference:string,section?:string){
 const chosen=section?test.sectionSummaries?.find((part:any)=>part.id===section):undefined;
 const title=chosen&&test.skill==='reading'?chosen.title:chosen?test.title+' · Part '+(chosen.index+1):test.title;
 const path=testIntroductionPath(test,section),canonical=STUDENT_ORIGIN+path;
 const description=`${title}. IELTS ${test.skill==='listening'?'Listening':'Reading'} practice with ${chosen?.questions||test.questions} questions. Start free, choose practice or test mode, and review your answers after submitting.`;
 const parts=(test.sectionSummaries||[]).map((part:any)=>`<li><a href="${escapeHtml(testIntroductionPath(test,part.id))}">${escapeHtml(part.title)}</a></li>`).join('');
 const body=`<article class="test-introduction"><nav><a href="/full-tests?skill=${test.skill}">${test.skill==='listening'?'Listening':'Reading'}</a></nav><h1>${escapeHtml(title)}</h1><p>Test ID: ${escapeHtml(test.id)}</p><p>${escapeHtml(description)}</p><p>${test.duration} minutes · ${test.passages} ${test.skill==='listening'?'parts':'passages'}</p><ul>${parts}</ul><a href="${escapeHtml(path)}?open=1">Choose a mode and start</a></article>`;
 const json=(value:any)=>JSON.stringify(value).replace(/</g,'\\u003c');
 const structured={"@context":"https://schema.org","@type":"LearningResource",name:title,description,url:canonical,inLanguage:'en',learningResourceType:'Practice test',isAccessibleForFree:true};
 const head=`<title>${escapeHtml(title)} · IELTS Studio</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta name="robots" content="index,follow"><script type="application/ld+json">${json(structured)}</script><script>window.__TEST_ROUTE__=${json({reference,testId:test.id,slug:test.slug})}</script>`;
 return template.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\s+[^>]*(?:name="description"|property="og:(?:title|description|url)")[^>]*>/gi,'').replace('</head>',head+'</head>').replace('<div id="root"></div>','<div id="root">'+body+'</div>');
}
export function registerTestPageRoutes(app:Express,{caller,optionalCaller,backend,apiError}:any){
 app.post('/api/admin/test-url',async(req,res)=>{try{const c=await caller(req);if(!c.isAdmin)throw new AssessmentError(403,'Administrator access required.');if(!/^[\w-]{1,128}$/.test(req.body?.id||'')||typeof req.body?.title!=='string'||!req.body.title.trim()||req.body.title.length>250)throw new AssessmentError(400,'Enter a valid test ID and title.');res.json({slug:await ensureTestUrl(c.db,req.body.id,req.body.title)});}catch(error){apiError(res,error);}});
 app.post('/api/admin/test-urls/backfill',async(req,res)=>{try{
  const c=await caller(req);if(!c.isAdmin)throw new AssessmentError(403,'Administrator access required.');
  const items=req.body?.items;if(!Array.isArray(items)||!items.length||items.length>20)throw new AssessmentError(400,'Choose up to 20 tests.');
  const registered=[];for(const item of items){if(!/^[\w-]{1,128}$/.test(item?.id||'')||typeof item?.title!=='string'||!item.title.trim()||item.title.length>250)throw new AssessmentError(400,'Invalid test reference.');registered.push({id:item.id,slug:await ensureTestUrl(c.db,item.id,item.title)});}
  res.json({registered});
 }catch(error){apiError(res,error);}});
 app.post('/api/test-route' ,async(req,res)=>{try{
  const db=backend().db;let meta=await resolvePublicTest(db,req.body.reference);
  if(!meta&&req.headers?.authorization){const c=await optionalCaller(req);if(c.isAdmin)meta=await resolvePublicTest(db,req.body.reference,true);}
  if(!meta)throw new AssessmentError(404,'This test is unavailable.');res.json({testId:meta.id,slug:meta.slug});
 }catch(error){apiError(res,error);}});
 const introduction=async(req:any,res:any)=>{try{
  const meta=await resolvePublicTest(backend().db,req.params.reference);
  if(!meta)return res.status(404).set('X-Robots-Tag','noindex').send('Test not found.');
  const section=req.params.section;
  if(section&&!meta.sectionSummaries?.some((part:any)=>part.id===section))return res.status(404).send('Part not found.');
  const path=testIntroductionPath(meta,section);
  if(req.path!==path){const query=req.originalUrl.includes('?')?req.originalUrl.slice(req.originalUrl.indexOf('?')):'';return res.redirect(308,path+query);}
  shell??=readFile(join(process.cwd(),'dist/index.html'),'utf8').catch(error=>{shell=undefined;throw error;});
  res.set('Cache-Control','public, max-age=0, s-maxage=60, stale-while-revalidate=60').type('html').send(renderTestIntroduction(await shell,meta,req.params.reference,section));
 }catch(error){console.error('Test introduction failed:',error);const quota=[8,'8','resource-exhausted','RESOURCE_EXHAUSTED'].includes((error as any)?.code);res.status(503).set('Retry-After',quota?'3600':'60').send(quota?'The database has reached its free daily read quota. Please try again after the quota resets.':'This test is temporarily unavailable. Please retry.');}};
 app.get('/tests/:reference/sections/:section',introduction);
 app.get('/tests/:reference',introduction);
}
