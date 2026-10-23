import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Play,Pause,RotateCcw} from 'lucide-react';
import type {EditablePart} from '../types';
import {listeningTracks} from '../services/listening';
export const playbackSpeeds=[.8,.85,.9,.95,1,1.05,1.1,1.15,1.2,1.25];
export const audioTime=(s:number)=>Math.floor(Math.max(0,s)/60)+':'+String(Math.floor(Math.max(0,s)%60)).padStart(2,'0');
const emptySources:Record<string,string>={};
export function ListeningAudio({parts,src,exam,stopSignal=0,disabled=false,sources=emptySources}:{parts?:EditablePart[];src?:string;exam:boolean;stopSignal?:number;disabled?:boolean;sources?:Record<string,string>}){
 const tracks=useMemo(()=>listeningTracks(parts||[{id:'audio',title:'Recording',audio:src,passageHtml:'',questionHtml:'',slots:{},questions:[]}]),[parts,src]);
 const audio=useRef<HTMLAudioElement>(null),resume=useRef(false),pendingSeek=useRef<number|null>(null),advancing=useRef(false),generation=useRef(0);
 const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[started,setStarted]=useState(false),[complete,setComplete]=useState(false),[error,setError]=useState(''),[current,setCurrent]=useState(0),[durations,setDurations]=useState<Record<string,number>>({}),[speed,setSpeed]=useState(4);
 const track=tracks[index],rate=playbackSpeeds[speed];
 const lengths=tracks.map(t=>Math.max(0,(t.end||durations[t.src]||0)-t.start));
 const offset=lengths.slice(0,index).reduce((a,b)=>a+b,0),total=lengths.reduce((a,b)=>a+b,0),position=offset+Math.max(0,current-(track?.start||0));
 const pause=()=>{generation.current++;resume.current=false;audio.current?.pause();setPlaying(false)};
 useEffect(()=>{pause()},[stopSignal,disabled,exam]);
 useEffect(()=>{const element=audio.current;return()=>{generation.current++;resume.current=false;element?.pause();element?.removeAttribute('src');element?.load()}},[]);
 useEffect(()=>{advancing.current=false;setError('');setCurrent(track?.start||0);audio.current?.load()},[index,track?.src,sources[track?.src||'']]);
 useEffect(()=>{if(audio.current)audio.current.playbackRate=rate},[rate,index]);
 useEffect(()=>{
  const elements=[...new Set(tracks.map(t=>t.src).filter(Boolean))].map(url=>{const el=document.createElement('audio');el.preload='metadata';el.onloadedmetadata=()=>{if(Number.isFinite(el.duration))setDurations(d=>({...d,[url]:el.duration}))};el.src=sources[url]||url;return el});
  return()=>elements.forEach(el=>{el.onloadedmetadata=null;el.removeAttribute('src');el.load()});
 },[tracks,sources]);
 const play=async()=>{if(disabled||!audio.current||!track?.src)return;const request=++generation.current;try{await audio.current.play();if(request===generation.current)setError('')}catch{if(request===generation.current)setError('Audio could not start. Press play to retry.')}};
 const jump=(nextIndex:number,time:number)=>{if(exam||disabled)return;resume.current=playing;pendingSeek.current=time;if(index===nextIndex){if(audio.current)audio.current.currentTime=time;setCurrent(time);pendingSeek.current=null}else setIndex(nextIndex)};
 const next=()=>{if(advancing.current)return;advancing.current=true;if(index+1<tracks.length){resume.current=true;pendingSeek.current=null;setIndex(i=>i+1)}else{setComplete(true);pause()}};
 const seek=(value:number)=>{let start=0;for(let i=0;i<tracks.length;i++){if(value<start+lengths[i]||i===tracks.length-1){jump(i,tracks[i].start+Math.min(lengths[i],Math.max(0,value-start)));return}start+=lengths[i]}};
 if(!track?.src)return <p role="alert">No recording is assigned to {track?.label||'this test'}. Please report this test.</p>;
 return <section className="listening-player compact-audio" aria-label="Listening audio player">
  <audio ref={audio} src={sources[track.src]||track.src||undefined} preload="auto" playsInline
   onLoadedMetadata={()=>{const el=audio.current;if(!el)return;if(Number.isFinite(el.duration))setDurations(d=>({...d,[track.src]:el.duration}));el.playbackRate=rate;el.currentTime=pendingSeek.current??track.start;pendingSeek.current=null;setCurrent(el.currentTime)}}
   onCanPlay={()=>{if(resume.current&&!disabled){resume.current=false;void play()}}}
   onPlay={()=>{advancing.current=false;setPlaying(true);setStarted(true);setComplete(false)}} onPause={()=>setPlaying(false)}
   onTimeUpdate={()=>{const el=audio.current;if(!el)return;setCurrent(el.currentTime);if(track.end&&el.currentTime>=track.end){el.pause();next()}}}
   onEnded={next} onError={()=>{pause();setError('Recording unavailable. Check your connection, then retry.')}}/>
  <button type="button" className="reader-icon audio-toggle" disabled={disabled||(exam&&started&&(playing||complete)&&!error)} aria-label={playing?'Pause recording':'Play recording'} title={exam&&started&&playing?'Test mode: continuous playback':playing?'Pause':'Play'} onClick={()=>playing?pause():void play()}>{error?<RotateCcw size={18}/>:playing?<Pause size={18}/>:<Play size={18}/>}</button>
  <span className="audio-part-label" title={track.name}>{track.label}</span>
  <span className="audio-time">{audioTime(position)} / {audioTime(total)}</span>
  <div className="audio-timeline"><input aria-label="Recording position" type="range" min={0} max={total||1} step={.1} value={Math.min(position,total||1)} disabled={exam||disabled||!total} onChange={e=>seek(Number(e.target.value))}/><div className="audio-markers">{tracks.map((t,i)=>{const start=lengths.slice(0,i).reduce((a,b)=>a+b,0);return <button type="button" key={i} title={t.label+' · '+audioTime(start)} aria-label={'Jump to '+t.label} disabled={exam||disabled||(!lengths[i]&&i!==index)} style={{left:(total?start/total*100:0)+'%'}} onClick={()=>jump(i,t.start)}><span/>{t.label}</button>})}</div></div>
  <label className="audio-speed"><span>{rate.toFixed(2).replace(/0$/,'')}×</span><input aria-label="Playback speed" aria-valuetext={rate+' times'} type="range" min={0} max={playbackSpeeds.length-1} step={1} value={speed} disabled={exam||disabled} onInput={e=>setSpeed(Number(e.currentTarget.value))} onChange={e=>setSpeed(Number(e.target.value))}/></label>
  {error&&<p className="audio-error" role="alert">{error}<button onClick={()=>{audio.current?.load();void play()}}>Retry</button></p>}
 </section>;
}
