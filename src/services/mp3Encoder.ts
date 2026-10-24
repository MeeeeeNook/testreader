import lamejs from '../vendor/lamejs.js';
export function encodeMonoMp3(samples:Float32Array,sampleRate:number,onProgress?:(percent:number)=>void){
 const encoder=new lamejs.Mp3Encoder(1,sampleRate,64),chunks:Uint8Array[]=[];let size=0,last=-1;
 for(let offset=0;offset<samples.length;offset+=1152){
  const pcm=new Int16Array(Math.min(1152,samples.length-offset));
  for(let i=0;i<pcm.length;i++){const v=Math.max(-1,Math.min(1,samples[offset+i]));pcm[i]=v<0?v*32768:v*32767}
  const out=encoder.encodeBuffer(pcm);if(out.length){const chunk=new Uint8Array(out.length);chunk.set(out);chunks.push(chunk);size+=chunk.length}
  const percent=Math.floor(100*(offset+pcm.length)/samples.length);if(percent!==last){last=percent;onProgress?.(percent)}
 }
 const tail=encoder.flush();if(tail.length){const chunk=new Uint8Array(tail.length);chunk.set(tail);chunks.push(chunk);size+=chunk.length}
 const output=new Uint8Array(size);let position=0;for(const chunk of chunks){output.set(chunk,position);position+=chunk.length}return output;
}
