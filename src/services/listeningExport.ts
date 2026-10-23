import JSZip from 'jszip';
import type {EditableTest} from '../types';
import {listeningTracks} from './listening';
import {cleanLayout} from './importer';

export function saveDownload(blob:Blob,name:string){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
const safe=(name:string)=>name.replace(/[\\/:*?"<>|]/g,'_').slice(0,120)||'Listening';
export async function listeningAudioZip(test:EditableTest,fetcher:typeof fetch=fetch):Promise<Blob>{
 const zip=new JSZip(),tracks=listeningTracks(test.parts),seen=new Map<string,string>(),playlist:string[]=[];
 for(const [i,track]of tracks.entries()){
  if(!track.src)throw Error('Audio is missing for '+track.label+'.');
  let name=seen.get(track.src);
  if(!name){name=String(i+1).padStart(2,'0')+'-'+safe(track.name);const response=await fetcher(track.src);if(!response.ok)throw Error('Could not download '+track.name+'. Please retry.');zip.file(name,await response.arrayBuffer());seen.set(track.src,name)}
  playlist.push(`${track.label}: ${name}${track.start?' · starts at '+track.start+' seconds':''}${track.end?' · ends at '+track.end+' seconds':''}`);
 }
 if(!tracks.length)throw Error('This test has no audio files.');
 zip.file('Playback-order.txt',test.title+'\n\n'+playlist.join('\n'));
 return zip.generateAsync({type:'blob',compression:'STORE'});
}
export function transcriptText(test:EditableTest):string{
 return [test.title,...test.parts.map((part,index)=>{const el=document.createElement('div');el.innerHTML=cleanLayout(part.passageHtml);el.querySelectorAll('p,div,li,br').forEach(n=>n.append(document.createTextNode('\n')));return `\n${part.title||'Part '+(index+1)}\n\n${el.textContent||'No transcript provided.'}`})].join('\n');
}
export async function downloadListeningAudio(test:EditableTest){saveDownload(await listeningAudioZip(test),safe(test.title)+'-audio.zip')}
