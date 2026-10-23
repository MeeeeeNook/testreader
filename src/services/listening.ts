import type {EditablePart, EditableTest, ListeningRecording} from '../types';

export const audioExtension = /\.(mp3|m4a|wav|ogg|oga|aac|flac|webm|mp4)$/i;
export const audioMime = (name:string) => ({mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',aac:'audio/aac',flac:'audio/flac',webm:'audio/webm'}[name.split('.').pop()?.toLowerCase()||'']||'application/octet-stream');
const fileName=(value:string)=>{try{return decodeURIComponent(value.split(/[?#]/)[0].split('/').pop()||'')}catch{return value}};

export function audioReferences(source:string):string[]{
  const match=/\b(?:const|let|var)\s+audio_listenings\s*=\s*(\[[\s\S]*?\])\s*;/.exec(source);
  if(!match)return [];
  try{const value=JSON.parse(match[1]);return Array.isArray(value)?value.filter(v=>typeof v==='string'):[]}catch{return []}
}
export function isListeningSource(source:string){return /\bis_exam_listening\s*=\s*true\b/.test(source)||audioReferences(source).length>0}

export function assignImportedAudio(test:EditableTest,files:ListeningRecording[],references:string[]):EditableTest{
  const assignments:(ListeningRecording|undefined)[]=test.parts.map(()=>undefined);
  if(files.length===1)assignments.fill(files[0]);
  else {
    test.parts.forEach((p,i)=>{const position=p.position||i+1;const matches=files.filter(f=>new RegExp('(?:part|section|sec)[ _.-]*0?'+position+'(?:[^0-9]|$)','i').test(f.name));if(matches.length===1)assignments[i]=matches[0]});
    // Original playback order is useful only when every part has its own reference.
    // Do not shift section 3 into section 2 when a file is missing.
    if(references.length===test.parts.length)test.parts.forEach((p,i)=>{
      if(assignments[i])return;
      const matches=files.filter(f=>fileName(f.name).toLowerCase()===fileName(references[i]).toLowerCase());
      if(matches.length!==1||assignments.includes(matches[0]))return;
      const named=matches[0].name.match(/(?:part|section|sec)[ _.-]*0?([1-4])(?:[^0-9]|$)/i);
      if(!named||Number(named[1])===(p.position||i+1))assignments[i]=matches[0];
    });
  }
  return {...test,skill:'listening',audioFiles:files,duration:test.parts.length===4?30:test.parts.length*10,parts:test.parts.map((p,i)=>({...p,audio:assignments[i]?.url||'',audioName:assignments[i]?.name||''}))};
}
export interface ListeningTrack {src:string;name:string;partIds:string[];label:string;start:number;end?:number}
export function listeningTracks(parts:EditablePart[]):ListeningTrack[]{
  const result:ListeningTrack[]=[];
  for(const [index,part]of parts.entries()){
    const src=part.audio||'',start=Math.max(0,Number(part.audioStart)||0),end=Number(part.audioEnd)>start?Number(part.audioEnd):undefined;
    const previous=result.at(-1);
    if(src&&previous?.src===src&&previous.start===start&&previous.end===end){previous.partIds.push(part.id);previous.label+=' / Part '+(part.position||index+1);continue}
    if(src&&previous?.src===src&&start>previous.start&&!previous.end)previous.end=start;
    result.push({src,name:part.audioName||fileName(src)||'Recording '+(result.length+1),partIds:[part.id],label:'Part '+(part.position||index+1),start,...(end?{end}:{})});
  }
  return result;
}
export function recordingLibrary(test:EditableTest):ListeningRecording[]{
  const files=[...(test.audioFiles||[])];
  for(const p of test.parts)if(p.audio&&!files.some(f=>f.url===p.audio))files.push({id:'part-'+p.id,name:p.audioName||fileName(p.audio)||p.title,url:p.audio});
  return files;
}

export function dividerIssues(parts:EditablePart[]):string[]{
 const issues:string[]=[];
 for(const url of new Set(parts.map(p=>p.audio).filter(Boolean))){
  const shared=parts.filter(p=>p.audio===url);
  if(shared.length<2||!shared.some(p=>(p.audioStart||0)>0))continue;
  for(let i=1;i<shared.length;i++)if(!Number.isFinite(shared[i].audioStart)||(shared[i].audioStart||0)<=(shared[i-1].audioStart||0))issues.push('Complete the shared recording dividers: every later part needs an increasing start timestamp.');
 }
 return [...new Set(issues)];
}
