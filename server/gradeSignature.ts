import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {AssessmentError} from './assessment';
function stable(value:any):any {return Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;}
export function gradeSigner(secret:string){
 const key=createHash('sha256').update('ielts-history-v1\0'+secret).digest();
 const sign=(record:any)=>{const {gradeSignature,...data}=record;return createHmac('sha256',key).update(JSON.stringify(stable(data))).digest('hex');};
 const verify=(record:any)=>{if(!record||typeof record.gradeSignature!=='string'||!/^[a-f0-9]{64}$/.test(record.gradeSignature))return false;return timingSafeEqual(Buffer.from(record.gradeSignature,'hex'),Buffer.from(sign(record),'hex'));};
 return {sign,verify};
}
export function configuredGradeSigner(){const key=process.env.HISTORY_SIGNING_SECRET||process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.FIREBASE_SERVICE_ACCOUNT||process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;if(!key)throw new AssessmentError(503,'Result verification is not configured. Your result is saved on this device.');return gradeSigner(key);}
