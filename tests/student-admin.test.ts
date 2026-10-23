import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerStudentRoutes} from '../server/studentRoutes';
function fixture(admin=true){
 const routes=new Map<string,Function>(),calls:any[]=[];
 const user={uid:'student',email:'student@example.test',metadata:{creationTime:'2026-01-01T00:00:00Z',lastSignInTime:'2026-10-23T01:00:00Z'},providerData:[{providerId:'google.com'}],emailVerified:true,disabled:false};
 const ref={set:async(value:any)=>{calls.push(['profile',value])},collection:(name:string)=>name};
 const auth={getUser:async()=>{calls.push(['getUser']);return user},updateUser:async(...a:any[])=>calls.push(['disable',...a]),revokeRefreshTokens:async()=>calls.push(['revoke']),deleteUser:async()=>calls.push(['deleteAuth'])};
 registerStudentRoutes({post:(path:string,handler:Function)=>routes.set(path,handler)} as any,async()=>({isAdmin:admin,identity:{uid:'owner'}}),()=>({auth,db:{doc:()=>ref,recursiveDelete:async(name:string)=>calls.push(['deleteCollection',name])}}),(res,e:any)=>res.status(e.status||503).json({error:e.message}));
 async function run(path:string,body:any){let status=200,data:any;const res:any={status:(s:number)=>{status=s;return res},json:(d:any)=>{data=d}};await routes.get('/api/admin/'+path)!({body},res);return {status,data}}
 return {run,calls,user};
}
test('student management rejects unauthorized, unsafe IDs, owner deletion and unconfirmed deletion',async()=>{
 const no=fixture(false);assert.equal((await no.run('student-details',{targetUserId:'student'})).status,403);assert.equal(no.calls.length,0);
 const f=fixture();assert.equal((await f.run('student-details',{targetUserId:'../owner'})).status,400);assert.equal(f.calls.length,0);
 assert.equal((await f.run('student-delete',{targetUserId:'student',confirmEmail:'wrong'})).status,400);assert.equal(f.calls.some(c=>c[0]==='disable'),false);
 f.user.email='manhcuong2006ht@gmail.com';assert.equal((await f.run('student-delete',{targetUserId:'student',confirmEmail:f.user.email})).status,403);assert.equal(f.calls.some(c=>c[0]==='deleteAuth'),false);
});
test('details use Auth timestamps and deletion clears personal data while blocking old sessions',async()=>{
 const f=fixture(),details=await f.run('student-details',{targetUserId:'student'});assert.equal(details.data.createdAt,Date.parse('2026-01-01T00:00:00Z'));assert.deepEqual(details.data.providers,['google.com']);
 const result=await f.run('student-delete',{targetUserId:'student',confirmEmail:f.user.email});assert.equal(result.status,200);
 assert.deepEqual(f.calls.filter(c=>c[0]==='deleteCollection').map(c=>c[1]),['attempts','vocabulary']);assert.ok(f.calls.findIndex(c=>c[0]==='disable')<f.calls.findIndex(c=>c[0]==='deleteAuth'));
 const tombstone=f.calls.filter(c=>c[0]==='profile').at(-1)[1];assert.equal(tombstone.status,'suspended');assert.equal(tombstone.email,undefined);assert.ok(tombstone.deletedAt);
});
