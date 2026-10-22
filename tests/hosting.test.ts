import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import app from '../api/index.ts';
test('the actual Vercel entry serves health, denies unauthenticated admin and returns JSON for unknown APIs',async()=>{
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const port=(server.address() as {port:number}).port;
 try{
  const base='http://127.0.0.1:'+port;
  const health=await fetch(base+'/api/health');assert.equal(health.status,200);assert.equal((await health.json()).service,'ielts-studio-api');
  const admin=await fetch(base+'/api/admin/articles/list',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(admin.status,401);assert.match((await admin.json()).error,/Sign in/);
  const unknown=await fetch(base+'/api/does-not-exist');assert.equal(unknown.status,404);assert.match(unknown.headers.get('content-type')||'',/json/);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

