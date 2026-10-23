import {createHash,createHmac} from 'node:crypto';
export class MediaStorageError extends Error{constructor(public code:string,message:string,public status=503){super(message)}}
export interface R2Config{accountId:string;accessKeyId:string;secretAccessKey:string;bucket:string;publicUrl:string}
export const r2Fields=['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_PUBLIC_BASE_URL'] as const;
export function readR2Config(env:Record<string,string|undefined>=process.env):R2Config|null{
 if(!r2Fields.some(key=>env[key]))return null;
 const missing=r2Fields.filter(key=>!env[key]?.trim());if(missing.length)throw new MediaStorageError('R2_SETUP_INCOMPLETE','Missing server settings: '+missing.join(', ')+'. Add these in Vercel, then redeploy.');
 const publicUrl=new URL(env.R2_PUBLIC_BASE_URL!);if(publicUrl.protocol!=='https:'||publicUrl.username||publicUrl.password||publicUrl.search||publicUrl.hash)throw new MediaStorageError('R2_INVALID_CONFIG','R2_PUBLIC_BASE_URL must be a public HTTPS URL without credentials or query parameters.');
 if(!/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID!)||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET_NAME!))throw new MediaStorageError('R2_INVALID_CONFIG','Check the R2 account ID and bucket name.');
 return {accountId:env.R2_ACCOUNT_ID!,accessKeyId:env.R2_ACCESS_KEY_ID!,secretAccessKey:env.R2_SECRET_ACCESS_KEY!,bucket:env.R2_BUCKET_NAME!,publicUrl:publicUrl.href.replace(/\/$/,'')};
}
const encode=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const hmac=(key:Buffer|string,value:string)=>createHmac('sha256',key).update(value).digest();
// AWS Signature V4 query signing. R2 uses region "auto" and service "s3".
export function presign(url:URL,method:string,credentials:Pick<R2Config,'accessKeyId'|'secretAccessKey'>,headers:Record<string,string>={},now=new Date(),expires=600,region='auto'){
 const result=new URL(url),timestamp=now.toISOString().replace(/[:-]|\.\d{3}/g,''),day=timestamp.slice(0,8),scope=day+'/'+region+'/s3/aws4_request';
 const normalized=Object.fromEntries(Object.entries({host:result.host,...headers}).map(([key,value])=>[key.toLowerCase(),value.trim().replace(/\s+/g,' ')]));const names=Object.keys(normalized).sort();
 result.searchParams.set('X-Amz-Algorithm','AWS4-HMAC-SHA256');result.searchParams.set('X-Amz-Credential',credentials.accessKeyId+'/'+scope);result.searchParams.set('X-Amz-Date',timestamp);result.searchParams.set('X-Amz-Expires',String(expires));result.searchParams.set('X-Amz-SignedHeaders',names.join(';'));
 const query=[...result.searchParams.entries()].map(([key,value])=>[encode(key),encode(value)]).sort(([a,av],[b,bv])=>a<b?-1:a>b?1:av<bv?-1:av>bv?1:0).map(([key,value])=>key+'='+value).join('&');
 const canonical=[method,result.pathname,query,names.map(name=>name+':'+normalized[name]+'\n').join(''),names.join(';'),'UNSIGNED-PAYLOAD'].join('\n');
 const signingKey=hmac(hmac(hmac(hmac('AWS4'+credentials.secretAccessKey,day),region),'s3'),'aws4_request');const signature=createHmac('sha256',signingKey).update('AWS4-HMAC-SHA256\n'+timestamp+'\n'+scope+'\n'+hash(canonical)).digest('hex');
 result.search=query+'&X-Amz-Signature='+signature;return result.href;
}
export function objectUrl(config:R2Config,key:string){return new URL('https://'+config.accountId+'.r2.cloudflarestorage.com/'+encode(config.bucket)+'/'+key.split('/').map(encode).join('/'))}
const mediaTypes:Record<string,string>={'audio/mpeg':'mp3','audio/mp4':'m4a','audio/wav':'wav','audio/ogg':'ogg','audio/aac':'aac','audio/flac':'flac','audio/webm':'webm','image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
export function validateMedia(input:any){
 const type=String(input?.contentType||'').toLowerCase(),size=Number(input?.size),digest=String(input?.sha256||'');
 if(!mediaTypes[type]||!Number.isSafeInteger(size)||size<=0||size>(type.startsWith('audio/')?150:15)*1024*1024||!/^[a-f0-9]{64}$/.test(digest))throw new MediaStorageError('INVALID_MEDIA','Choose a supported audio file up to 150 MB or image up to 15 MB.',400);
 return {type,size,key:(type.startsWith('audio/')?'audio':'images')+'/'+digest+'.'+mediaTypes[type]};
}
async function head(config:R2Config,key:string,fetcher:typeof fetch){
 let response:Response;try{response=await fetcher(presign(objectUrl(config,key),'HEAD',config),{method:'HEAD',signal:AbortSignal.timeout(15000)})}catch{throw new MediaStorageError('R2_CONNECTION_FAILED','Cannot reach Cloudflare R2. Check the account ID and server network connection.');}
 if(response.status===403||response.status===401)throw new MediaStorageError('R2_ACCESS_DENIED','R2 rejected the server credentials. Use a bucket-scoped Object Read & Write token.');
 if(response.status!==404&&!response.ok)throw new MediaStorageError('R2_HTTP_'+response.status,'R2 storage check failed (HTTP '+response.status+'). Check the bucket name and R2 access.');return response;
}
export async function prepareR2Upload(config:R2Config,input:unknown,fetcher:typeof fetch=fetch,now=new Date()){
 const media=validateMedia(input),existing=await head(config,media.key,fetcher),headers={'Content-Type':media.type};
 if(existing.ok&&Number(existing.headers.get('content-length'))!==media.size)throw new MediaStorageError('R2_OBJECT_MISMATCH','The stored recording size differs from this file. Contact the site owner.',409);
 return {provider:'r2',exists:existing.ok,publicUrl:config.publicUrl+'/'+media.key,headers,...(!existing.ok?{uploadUrl:presign(objectUrl(config,media.key),'PUT',config,headers,now)}:{})};
}
export async function checkR2(config:R2Config,fetcher:typeof fetch=fetch){await head(config,'__ielts_connection_check__',fetcher);return {provider:'r2',ready:true,bucket:config.bucket,message:'R2 credentials accepted. Browser uploads also require the bucket CORS policy and public read access.'}}

const xmlText=(value:string)=>value.replace(/&(?:amp|lt|gt|quot|apos);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[entity]!));
export async function listR2Files(config:R2Config,fetcher:typeof fetch=fetch){
 const files:{name:string;size:number}[]=[];let continuation='',truncated=false;const started=Date.now();
 do{
  const url=new URL('https://'+config.accountId+'.r2.cloudflarestorage.com/'+encode(config.bucket));url.searchParams.set('list-type','2');url.searchParams.set('max-keys','1000');if(continuation)url.searchParams.set('continuation-token',continuation);
  const response=await fetcher(presign(url,'GET',config),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new MediaStorageError('R2_INVENTORY_FAILED','Cannot list R2 files (HTTP '+response.status+'). Check the token read/list permissions.');
  const xml=await response.text();for(const item of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){const name=/<Key>([\s\S]*?)<\/Key>/.exec(item[1])?.[1],size=/<Size>(\d+)<\/Size>/.exec(item[1])?.[1];if(name!==undefined&&size!==undefined)files.push({name:xmlText(name),size:Number(size)})}
  truncated=/<IsTruncated>true<\/IsTruncated>/.test(xml);continuation=xmlText(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]||'');
  if(truncated&&!continuation)throw new MediaStorageError('R2_INVENTORY_RESPONSE','R2 returned an incomplete listing without a continuation token.');
 }while(truncated&&files.length<10000&&Date.now()-started<20000);
 return {files,truncated};
}
