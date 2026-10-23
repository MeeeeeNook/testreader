import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readR2Config,presign,prepareR2Upload,validateMedia,checkR2,listR2Files} from '../server/r2Storage';
import {registerMediaRoutes} from '../server/mediaRoutes';
const config={accountId:'a'.repeat(32),accessKeyId:'EXAMPLE_ACCESS_KEY',secretAccessKey:'example-secret',bucket:'ielts-media',publicUrl:'https://audio.example.test'};
const input={sha256:'b'.repeat(64),size:12000,contentType:'audio/mpeg'};
test('R2 is opt-in and incomplete server configuration fails with setting names, not secret values',()=>{
 assert.equal(readR2Config({}),null);assert.throws(()=>readR2Config({R2_ACCESS_KEY_ID:'sensitive-key'}),(error:any)=>error.code==='R2_SETUP_INCOMPLETE'&&/R2_ACCOUNT_ID/.test(error.message)&&!error.message.includes('sensitive-key'));
 assert.throws(()=>validateMedia({...input,sha256:'../escape'}),/supported/);assert.throws(()=>validateMedia({...input,contentType:'text/html'}),/supported/);assert.throws(()=>validateMedia({...input,size:151*1024*1024}),/supported/);
});
test('signing scopes each URL to one object, content type, region and expiry without exposing the secret',()=>{
 const result=new URL(presign(new URL('https://'+config.accountId+'.r2.cloudflarestorage.com/ielts-media/audio/file.mp3'),'PUT',config,{'Content-Type':'audio/mpeg'},new Date('2026-10-24T00:00:00Z')));
 assert.equal(result.searchParams.get('X-Amz-Date'),'20261024T000000Z');assert.equal(result.searchParams.get('X-Amz-Expires'),'600');assert.equal(result.searchParams.get('X-Amz-SignedHeaders'),'content-type;host');assert.match(result.searchParams.get('X-Amz-Credential')!,/20261024\/auto\/s3\/aws4_request/);assert.match(result.searchParams.get('X-Amz-Signature')!,/^[a-f0-9]{64}$/);assert.ok(!result.href.includes(config.secretAccessKey));
 const changed=presign(new URL(result.origin+'/ielts-media/audio/other.mp3'),'PUT',config,{'Content-Type':'audio/mpeg'},new Date('2026-10-24T00:00:00Z'));assert.notEqual(new URL(changed).searchParams.get('X-Amz-Signature'),result.searchParams.get('X-Amz-Signature'));
});
test('R2 upload tickets deduplicate stored objects and reject denied credentials or size conflicts',async()=>{
 const missing=await prepareR2Upload(config,input,async()=>new Response(null,{status:404}));assert.equal(missing.exists,false);assert.match(missing.uploadUrl!,/r2\.cloudflarestorage\.com/);assert.equal(missing.headers['Content-Type'],'audio/mpeg');assert.equal(missing.publicUrl,'https://audio.example.test/audio/'+input.sha256+'.mp3');
 const exists=await prepareR2Upload(config,input,async()=>new Response(null,{status:200,headers:{'content-length':'12000'}}));assert.equal(exists.exists,true);assert.equal(exists.uploadUrl,undefined);
 await assert.rejects(prepareR2Upload(config,input,async()=>new Response(null,{status:403})),(error:any)=>error.code==='R2_ACCESS_DENIED');await assert.rejects(prepareR2Upload(config,input,async()=>new Response(null,{status:200,headers:{'content-length':'1'}})),(error:any)=>error.code==='R2_OBJECT_MISMATCH');
 assert.equal((await checkR2(config,async()=>new Response(null,{status:404}))).ready,true);
});
test('media routes deny unauthenticated callers before reading any storage configuration',async()=>{
 const routes=new Map<string,Function>();registerMediaRoutes({post:(path:string,handler:Function)=>routes.set(path,handler)} as any,async()=>{throw Object.assign(new Error('Sign in'),{status:401})},()=>{throw Error('Must not read bucket')});
 for(const handler of routes.values()){let status=0,body:any;const res:any={status:(value:number)=>{status=value;return res},json:(value:any)=>{body=value}};await handler({},res);assert.equal(status,401);assert.match(body.error,/Sign in/)}
});

test('SigV4 matches the published AWS S3 query-signing test vector',()=>{
 // Public example credentials: https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html
 const url=new URL(presign(new URL('https://examplebucket.s3.amazonaws.com/test.txt'),'GET',{accessKeyId:'AKIAIOSFODNN7EXAMPLE',secretAccessKey:'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'},{},new Date('2013-05-24T00:00:00Z'),86400,'us-east-1'));
 assert.equal(url.searchParams.get('X-Amz-Signature'),'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});

test('R2 storage inventory counts paginated media without downloading recordings',async()=>{
 let calls=0;const result=await listR2Files(config,async(url:any)=>{calls++;assert.equal(new URL(url).searchParams.get('list-type'),'2');return new Response(calls===1?'<ListBucketResult><Contents><Key>audio/a.mp3</Key><Size>100</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>next&amp;token</NextContinuationToken></ListBucketResult>':'<ListBucketResult><Contents><Key>images/b.png</Key><Size>50</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>')});assert.equal(calls,2);assert.equal(result.truncated,false);assert.deepEqual(result.files,[{name:'audio/a.mp3',size:100},{name:'images/b.png',size:50}]);
});
