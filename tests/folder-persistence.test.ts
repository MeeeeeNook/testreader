import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
const owner={uid:'owner',email:'manhcuong2006ht@gmail.com',emailVerified:true,displayName:'Owner',getIdToken:async()=> 'token'};
const require=createRequire(import.meta.url);
test('folder choices survive database reload and menu metadata writes are batched without touching test content',async()=>{
 const state:any={user:owner,db:new Map([['users/owner',{libraryFolderVersion:0,libraryFolders:[]}]]),batches:[]};(globalThis as any).__folderDb=state;
 mkdirSync('node_modules/.cache',{recursive:true});const out=resolve('node_modules/.cache/folder-adapter.cjs');
 await build({entryPoints:['src/services/firestoreAdapter.ts'],outfile:out,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'memory-database',setup(b){
 b.onResolve({filter:/^\.\.\/firebase$/},()=>({path:'config',namespace:'memory'}));
 b.onResolve({filter:/^firebase\/firestore$/},()=>({path:'firestore',namespace:'memory'}));
 b.onResolve({filter:/^firebase\/storage$/},()=>({path:'storage',namespace:'memory'}));
 b.onLoad({filter:/.*/,namespace:'memory'},({path})=>({contents:path==='config'?`const s=globalThis.__folderDb;export const db={};export const auth={get currentUser(){return s.user}};export const storage={};export const OperationType={};export function handleFirestoreError(e){throw e;}`:path==='storage'?`const s=globalThis.__folderDb;export const ref=(_storage,path)=>({path});export const getDownloadURL=async ref=>{if(s.missingMedia)throw {code:'storage/object-not-found'};return 'https://media.example/'+ref.path};export const uploadBytesResumable=(ref,file)=>{const task={snapshot:{ref,totalBytes:file.size,bytesTransferred:file.size},cancel:()=>true,on:(_event,progress,error,complete)=>queueMicrotask(()=>{if(s.storageError){error(s.storageError);return}progress({bytesTransferred:0,totalBytes:file.size});progress({bytesTransferred:file.size/2,totalBytes:file.size});progress(task.snapshot);complete()})};return task};`:`
 const s=globalThis.__folderDb;export const doc=(_db,...path)=>path.join('/');export const collection=doc;
 const snapshot=path=>({exists:()=>s.db.has(path),data:()=>structuredClone(s.db.get(path))});
 export const getDoc=async path=>snapshot(path);export const getDocs=async()=>({docs:[]});export const setDoc=async(path,value)=>s.db.set(path,value);export const deleteDoc=async()=>{};
 export const query=()=>{};export const where=()=>{};export const orderBy=()=>{};export const limit=()=>{};export const startAfter=()=>{};export class DocumentSnapshot{}
 export const runTransaction=async(_db,fn)=>fn({get:async path=>snapshot(path),update:(path,patch)=>s.db.set(path,{...s.db.get(path),...structuredClone(patch)})});
 export const writeBatch=()=>{const operations=[];return {update:(path,patch)=>operations.push({path,patch}),commit:async()=>{s.batches.push(operations);for(const {path,patch}of operations)s.db.set(path,{...s.db.get(path),...structuredClone(patch)});}};};
 `}));
 }}]});
 try{const {FirestoreAdapter}=require(out),adapter=new FirestoreAdapter(),folders=[{id:'f',name:'Forecast',parentId:null,createdAt:1,updatedAt:1,showInFullTestMenu:true}];
 assert.equal(await adapter.saveLibraryFolders(folders,0),1);const loaded=await adapter.get('users','owner');assert.equal(loaded.libraryFolders[0].showInFullTestMenu,true);await assert.rejects(()=>adapter.saveLibraryFolders([],0),/changed in another tab/);
 const patches=Array.from({length:401},(_,i)=>({id:'test'+i,folderId:'f',folderPath:'Forecast',fullTestMenuFolders:[{id:'f',path:'Forecast'}]}));for(const p of patches)state.db.set('tests/'+p.id,{id:p.id,title:'Preserved title',passages:3});
 await adapter.updateTestOrganizations(patches);assert.deepEqual(state.batches.map((b:any[])=>b.length),[400,1]);assert.equal(state.db.get('tests/test0').title,'Preserved title');assert.deepEqual(state.db.get('tests/test400').fullTestMenuFolders,[{id:'f',path:'Forecast'}]);assert.ok(state.batches.flat().every((op:any)=>!('title' in op.patch)&&!('answer' in op.patch)));
 const transfer:number[]=[];assert.equal(await adapter.uploadMedia(new Blob(['audio']),'media/audio.mp3',(sent:number)=>transfer.push(sent)),'https://media.example/media/audio.mp3');assert.deepEqual(transfer,[0,2.5,5]);
 state.storageError={code:'storage/unauthorized',message:'Denied'};await assert.rejects(adapter.uploadMedia(new Blob(['audio']),'media/denied.mp3'),/storage\/unauthorized.*Storage rules/);state.storageError=null;
 state.missingMedia=true;assert.equal(await adapter.existingMedia('not-found'),null);state.missingMedia=false;assert.equal(await adapter.existingMedia('saved'),'https://media.example/saved');
 state.user=null;await assert.rejects(()=>new FirestoreAdapter().updateTestOrganizations(patches),/Administrator access required/);
 }finally{rmSync(out);delete (globalThis as any).__folderDb;}
});
test('failed optional server auth sync still loads the saved owner folder profile',async()=>{
 const stored={id:'owner',email:owner.email,name:'Owner',status:'active',libraryFolders:[{id:'saved',name:'Saved empty folder'}],libraryFolderVersion:7};
 const state:any={user:owner,profile:stored};(globalThis as any).__folderAuth=state;const previousFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Request timed out');};
 mkdirSync('node_modules/.cache',{recursive:true});const out=resolve('node_modules/.cache/folder-auth.cjs');
 await build({entryPoints:['src/services/auth.ts'],outfile:out,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'auth-regression',setup(b){
 b.onResolve({filter:/^firebase\/auth$/},()=>({path:'sdk',namespace:'stub'}));b.onResolve({filter:/^\.\.\/firebase$/},()=>({path:'config',namespace:'stub'}));b.onResolve({filter:/^\.\/firestoreAdapter$/},()=>({path:'adapter',namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},({path})=>({contents:path==='sdk'?`export const onAuthStateChanged=(_auth,callback)=>{globalThis.__folderAuth.callback=callback};export const signInWithPopup=()=>{};export const signOut=()=>{};`:path==='config'?`export const auth={get currentUser(){return globalThis.__folderAuth.user}};export const googleProvider={};`:`export const firestoreAdapter={clearRoleCache(){},async get(kind,id){if(kind!=='users'||id!=='owner')throw Error('Unexpected read');return globalThis.__folderAuth.profile},async put(){throw Error('Should not overwrite existing profile')}};`}));
 }}]});
 try{const api=require(out),states:any[]=[];api.subscribeAuth((s:any)=>states.push(s));await state.callback(owner);assert.equal(states.at(-1).role,'admin');assert.equal(states.at(-1).profile.libraryFolderVersion,7);assert.equal(states.at(-1).profile.libraryFolders[0].name,'Saved empty folder');}finally{globalThis.fetch=previousFetch;rmSync(out);delete (globalThis as any).__folderAuth;}
});
