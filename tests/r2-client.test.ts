import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
test('direct R2 uploads preserve progress and expose HTTP/network failures without sending files through Vercel',async()=>{
 mkdirSync('node_modules/.cache',{recursive:true});const out=resolve('node_modules/.cache/r2-upload-client.cjs');
 await build({entryPoints:['src/services/mediaStorage.ts'],outfile:out,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fake-identity',setup(builder){builder.onResolve({filter:/^\.\.\/firebase$/},()=>({path:'auth',namespace:'memory'}));builder.onLoad({filter:/.*/,namespace:'memory'},()=>({contents:"export const auth={currentUser:{uid:'owner',getIdToken:async()=> 'test-token'}};"}));}}]});
 const previousFetch=globalThis.fetch,previousXHR=globalThis.XMLHttpRequest;
 try{const api=createRequire(import.meta.url)(out);const bytes:number[]=[];let endpoint='',sentBody:Blob|null=null,headers:Record<string,string>={},mode='ok';
 class FakeXHR{upload:any={};status=200;onload:any;onerror:any;onabort:any;open(method:string,url:string){assert.equal(method,'PUT');endpoint=url}setRequestHeader(key:string,value:string){headers[key]=value}abort(){this.onabort?.()}send(blob:Blob){sentBody=blob;this.upload.onprogress({loaded:blob.size/2,total:blob.size,lengthComputable:true});if(mode==='network'){this.onerror();return}this.status=mode==='denied'?403:200;this.onload()}}
 const blob=new Blob(['audio data'],{type:'audio/mpeg'});await api.putMedia(blob,'https://account.r2.cloudflarestorage.com/media/file?signature=test',{'Content-Type':'audio/mpeg'},(sent:number)=>bytes.push(sent),()=>new FakeXHR());assert.equal(endpoint.startsWith('https://account.r2.cloudflarestorage.com'),true);assert.equal(sentBody,blob);assert.deepEqual(bytes,[5]);assert.equal(headers['Content-Type'],'audio/mpeg');
 mode='denied';await assert.rejects(api.putMedia(blob,'https://r2.example/file',{},undefined,()=>new FakeXHR()),/R2_UPLOAD_HTTP_403/);mode='network';await assert.rejects(api.putMedia(blob,'https://r2.example/file',{},undefined,()=>new FakeXHR()),/R2_UPLOAD_NETWORK/);
 mode='ok';globalThis.XMLHttpRequest=FakeXHR as any;const calls:string[]=[];globalThis.fetch=async(url:any,options:any)=>{calls.push(String(url));if(url==='/api/admin/media/config')return Response.json({provider:'r2'});if(url==='/api/admin/media/prepare'){const body=JSON.parse(options.body);assert.equal(body.size,10);assert.match(body.sha256,/^[a-f0-9]{64}$/);return Response.json({provider:'r2',exists:false,uploadUrl:'https://account.r2.cloudflarestorage.com/upload',publicUrl:'https://audio.example.test/file.mp3',headers:{'Content-Type':'audio/mpeg'}})}assert.equal(options.method,'HEAD');return new Response(null,{status:200})};
 assert.equal(await api.uploadToR2(blob),'https://audio.example.test/file.mp3');assert.deepEqual(calls,['/api/admin/media/config','/api/admin/media/prepare','https://audio.example.test/file.mp3']);
 globalThis.fetch=async(url:any)=>String(url).startsWith('/api/')?Response.json({provider:'r2',exists:true,publicUrl:'https://audio.example.test/file.mp3'}):new Response(null,{status:403});await assert.rejects(api.uploadToR2(blob),/R2_PUBLIC_ACCESS_FAILED/);
 }finally{globalThis.fetch=previousFetch;globalThis.XMLHttpRequest=previousXHR;rmSync(out)}
});
