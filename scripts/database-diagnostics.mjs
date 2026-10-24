import {readFile} from 'node:fs/promises';
import {cert} from 'firebase-admin/app';
const config=JSON.parse(await readFile(new URL('../firebase-applet-config.json',import.meta.url),'utf8'));
let raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.FIREBASE_SERVICE_ACCOUNT||process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if(!raw){console.log('Database diagnostic: server credential unavailable.');process.exit(0);}
raw=raw.trim();if((raw.startsWith('"')&&raw.endsWith('"'))||(raw.startsWith("'")&&raw.endsWith("'")))raw=raw.slice(1,-1);if(!raw.startsWith('{'))raw=Buffer.from(raw,'base64').toString('utf8');
const account=JSON.parse(raw);account.private_key=account.private_key?.replace(/\\n/g,'\n');
if(account.project_id!==config.projectId)throw Error('Database diagnostic project mismatch.');
try{
 const {access_token}=await cert(account).getAccessToken();
 const path=`projects/${config.projectId}/databases/${config.firestoreDatabaseId||'(default)'}`;
 const response=await fetch('https://firestore.googleapis.com/v1/'+path,{headers:{Authorization:'Bearer '+access_token},signal:AbortSignal.timeout(15000)});
 const data=await response.json();console.log(JSON.stringify({databaseMetadata:{status:response.status,name:data.name,locationId:data.locationId,type:data.type,databaseEdition:data.databaseEdition,freeTier:data.freeTier,createTime:data.createTime,error:response.ok?undefined:data.error?.message}}));
}catch(error){console.log('Database metadata diagnostic unavailable: '+error.message);}
