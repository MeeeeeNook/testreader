import type {Express} from 'express';
const publicFields=['id','slug','title','skill','source','originSource','access','status','duration','audioFiles','coverImage','passages','passageTitles','sectionSummaries','questions','updatedAt','createdAt','folderId','folderPath','fullTestMenuFolders','folderPages'];
export function registerCatalogRoutes(app:Express,backend:any,fail:any,now=Date.now){
 let cache:{until:number;tests:any[]}|undefined,pending:Promise<any[]>|undefined;
 const load=()=>{if(cache&&cache.until>now())return Promise.resolve(cache.tests);if(pending)return pending;
  pending=(async()=>{const snapshot=await backend().db.collection('tests').where('status','==','published').get();const tests=snapshot.docs.map((doc:any)=>({...doc.data(),id:doc.id})).filter((test:any)=>test.status==='published'&&!test.deletedAt).map((test:any)=>Object.fromEntries(publicFields.filter(field=>test[field]!==undefined).map(field=>[field,test[field]])));cache={until:now()+300000,tests};return tests;})();
  void pending.finally(()=>{pending=undefined}).catch(()=>{});return pending;
 };
 app.get('/api/catalog',async(_req,res)=>{try{const tests=await load();res.set('Cache-Control','public, max-age=300, s-maxage=300, stale-while-revalidate=3600').json({tests});}catch(error){if(cache){cache.until=now()+60000;res.set('Cache-Control','public,max-age=60,s-maxage=60').json({tests:cache.tests,stale:true});return;}fail(res,error);}});
}
