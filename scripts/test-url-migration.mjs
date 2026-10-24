import {readFile} from 'node:fs/promises';
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {ensureTestUrl} from '../server/testUrlRegistry.mjs';
if(process.env.VERCEL_ENV==='production'){
 const config=JSON.parse(await readFile(new URL('../firebase-applet-config.json',import.meta.url),'utf8'));
 let raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.FIREBASE_SERVICE_ACCOUNT||process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
 if(!raw)throw Error('Test URL migration requires the configured Firebase server credential.');
 raw=raw.trim();if((raw.startsWith('"')&&raw.endsWith('"'))||(raw.startsWith("'")&&raw.endsWith("'")))raw=raw.slice(1,-1);if(!raw.startsWith('{'))raw=Buffer.from(raw,'base64').toString('utf8');
 const account=JSON.parse(raw);account.private_key=account.private_key?.replace(/\\n/g,'\n');if(account.project_id!==config.projectId)throw Error('Test URL migration project mismatch.');
 const app=initializeApp({credential:cert(account),projectId:config.projectId},'URL_MIGRATION');
 const db=getFirestore(app,config.firestoreDatabaseId||'(default)'),marker=db.doc('site_settings/test_urls_v1');
 if(!(await marker.get()).exists){
  const tests=await db.collection('tests').get();let count=0;
  for(const doc of tests.docs){const test=doc.data();if(typeof test.title!=='string'||!test.title.trim()||test.title.length>250)continue;await ensureTestUrl(db,doc.id,test.title);count++;}
  await marker.set({completedAt:Date.now(),tests:count});console.log('Readable test URLs registered: '+count);
 }else console.log('Readable test URLs: existing registry retained.');
 await db.terminate();await deleteApp(app);
}else console.log('Readable test URLs: migration runs only in production.');
