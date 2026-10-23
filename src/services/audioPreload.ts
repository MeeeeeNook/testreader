/** Fetch complete recordings before the timer starts. Keep audio only for this mounted session. */
export async function preloadRecordings(urls:string[],signal:AbortSignal,onProgress:(done:number,total:number,bytes:number)=>void){
 const unique=[...new Set(urls.filter(Boolean))],sources:Record<string,string>={};let bytes=0;
 try{
  for(const [index,url]of unique.entries()){
   const response=await fetch(url,{signal});if(!response.ok)throw Error('Audio '+(index+1)+' could not load (HTTP '+response.status+').');
   const reader=response.body?.getReader(),chunks:Uint8Array[]=[];
   if(reader){while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);bytes+=value.byteLength;onProgress(index,unique.length,bytes)}}
   else{const value=new Uint8Array(await response.arrayBuffer());chunks.push(value);bytes+=value.byteLength}
   signal.throwIfAborted();sources[url]=URL.createObjectURL(new Blob(chunks as BlobPart[],{type:response.headers.get('Content-Type')||'audio/mpeg'}));onProgress(index+1,unique.length,bytes);
  }
  return sources;
 }catch(error){Object.values(sources).forEach(URL.revokeObjectURL);throw error}
}
