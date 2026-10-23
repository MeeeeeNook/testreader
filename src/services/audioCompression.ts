import CompressionWorker from './audioCompression.worker?worker';
export interface CompressedAudio {blob:Blob;name:string;originalSize:number;saved:number;duration:number}
const bitrate=48000,sampleRate=22050;
function durationOf(blob:Blob){return new Promise<number>((resolve,reject)=>{
 const element=document.createElement('audio'),url=URL.createObjectURL(blob);
 const done=(error?:Error)=>{clearTimeout(timer);element.removeAttribute('src');URL.revokeObjectURL(url);error?reject(error):resolve(duration)};let duration=0;
 const timer=setTimeout(()=>done(new Error('Audio metadata timed out. Try uploading an MP3 file.')),30000);
 element.preload='metadata';element.onloadedmetadata=()=>{duration=element.duration;Number.isFinite(duration)&&duration>0?done():done(new Error('The recording duration could not be read.'))};element.onerror=()=>done(new Error('This browser could not read the audio. Try an MP3 file.'));element.src=url;
})}
export async function compressListeningAudio(blob:Blob,name:string,onProgress?:(percent:number,label:string)=>void):Promise<CompressedAudio>{
 onProgress?.(0,'Reading audio information');const duration=await durationOf(blob);
 // Avoid recompressing an already economical recording or increasing its size.
 if(blob.size*8/duration<=bitrate*1.08)return {blob,name,originalSize:blob.size,saved:0,duration};
 if(duration>7200)throw new Error('This recording exceeds two hours. Split it into parts before uploading.');
 if(!globalThis.AudioContext||!globalThis.OfflineAudioContext||!globalThis.Worker)throw new Error('Audio compression is unavailable in this browser. Use a recent Chrome or Edge browser.');
 onProgress?.(3,'Decoding audio');const context=new AudioContext();let decoded:AudioBuffer;
 try{decoded=await context.decodeAudioData(await blob.arrayBuffer())}catch{throw new Error('Audio decoding failed. Convert the source to MP3 and retry.')}finally{await context.close()}
 onProgress?.(8,'Converting to mono');const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*sampleRate),sampleRate),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const mono=await offline.startRendering();
 const pcm=mono.getChannelData(0).slice(),worker=new CompressionWorker();
 const encoded=await new Promise<ArrayBuffer>((resolve,reject)=>{
  let timer:ReturnType<typeof setTimeout>;const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>{worker.terminate();reject(new Error('Audio compression stopped responding for 120 seconds. Try a smaller recording.'))},120000)};reset();
  worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('Audio compression failed. Try a smaller recording or an MP3 source.'))};
  worker.onmessage=(event:MessageEvent<{percent?:number;buffer?:ArrayBuffer;error?:string}>)=>{reset();if(event.data.error){clearTimeout(timer);worker.terminate();reject(new Error('Audio compression: '+event.data.error))}else if(event.data.buffer){clearTimeout(timer);worker.terminate();resolve(event.data.buffer)}else if(event.data.percent!==undefined)onProgress?.(10+event.data.percent*.9,'Compressing MP3, mono 48 kbps')};worker.postMessage({pcm:pcm.buffer,sampleRate},[pcm.buffer]);
 });
 const compressed=new Blob([encoded],{type:'audio/mpeg'});onProgress?.(100,'Compression complete');
 return compressed.size<blob.size?{blob:compressed,name:name.replace(/\.[^.]+$/,'')+'.mp3',originalSize:blob.size,saved:blob.size-compressed.size,duration}:{blob,name,originalSize:blob.size,saved:0,duration};
}
