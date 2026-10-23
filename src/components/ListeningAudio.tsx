import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Play,Pause,Headphones,RotateCcw} from 'lucide-react';
import type {EditablePart} from '../types';
import {listeningTracks} from '../services/listening';

export function ListeningAudio({parts,src,exam}:{parts?:EditablePart[];src?:string;exam:boolean}){
 const tracks=useMemo(()=>listeningTracks(parts||[{id:'audio',title:'Recording',audio:src,passageHtml:'',questionHtml:'',slots:{},questions:[]}]),[parts,src]);
 const audio=useRef<HTMLAudioElement>(null),continuePlaying=useRef(false),advancing=useRef(false),mounted=useRef(true);
 const [index,setIndex]=useState(0),[started,setStarted]=useState(false),[playing,setPlaying]=useState(false),[complete,setComplete]=useState(false),[error,setError]=useState('');
 const track=tracks[index];
 useEffect(()=>{mounted.current=true;const el=audio.current;return()=>{mounted.current=false;el?.pause()}},[]);
 useEffect(()=>{advancing.current=false;setError(track&&!track.src?'Audio is missing for '+track.label+'. Please report this test.':'');audio.current?.load()},[index,track?.src]);
 useEffect(()=>{continuePlaying.current=false;audio.current?.pause()},[exam]);
 const play=async()=>{const el=audio.current;if(!el||!track?.src){setError('This part has no recording. Please report this test.');return}try{await el.play();if(mounted.current){setStarted(true);setError('')}}catch{if(mounted.current)setError('Audio could not start. Press Play to retry.')}};
 const next=()=>{
  if(advancing.current)return;advancing.current=true;
  if(index+1<tracks.length){continuePlaying.current=true;setIndex(i=>i+1)}
  else{continuePlaying.current=false;setComplete(true);setPlaying(false);audio.current?.pause()}
 };
 if(!track)return <p className="studio-callout" role="alert">No recordings are assigned. Please report this test.</p>;
 return <section className="listening-player" aria-label="Listening test audio">
  <div className="listening-player-heading"><Headphones size={20}/><div><strong>{complete?'Recording complete':track.label}</strong><small>{track.name} · Recording {index+1} of {tracks.length}</small></div>
  {(!exam||!started||error)&&<button className="reader-icon" title={error?'Retry audio':playing?'Pause audio':'Play audio'} aria-label={error?'Retry audio':playing?'Pause audio':'Play audio'} onClick={()=>playing&&!error?audio.current?.pause():void play()}>{error?<RotateCcw size={19}/>:playing?<Pause size={19}/>:<Play size={19}/>}</button>}</div>
  <audio ref={audio} src={track.src||undefined} controls={!exam} preload="metadata" playsInline
   onLoadedMetadata={()=>{if(audio.current&&track.start)audio.current.currentTime=track.start}}
   onCanPlay={()=>{if(continuePlaying.current){continuePlaying.current=false;void play()}}}
   onEnded={next}
   onTimeUpdate={()=>{if(track.end&&audio.current&&audio.current.currentTime>=track.end){audio.current.pause();next()}}}
   onPlay={()=>{advancing.current=false;setPlaying(true);setStarted(true);setComplete(false)}} onPause={()=>setPlaying(false)}
   onError={()=>{continuePlaying.current=false;setPlaying(false);setError(track.src?'Recording could not load. Check your connection and retry this recording.':'Audio is missing for '+track.label+'. Please report this test.')}}/>
  <div className="listening-player-foot"><small>{exam?'Exam mode · one continuous play, without seeking':'Recordings play in order automatically. Changing question parts keeps the audio playing.'}</small>{!exam&&<label>Speed<select aria-label="Listening playback speed" defaultValue="1" onChange={e=>{if(audio.current)audio.current.playbackRate=Number(e.target.value)}}>{[.75,1,1.25,1.5].map(v=><option value={v} key={v}>{v}×</option>)}</select></label>}</div>
  {error&&<p role="alert">{error} <button className="quiet-button" onClick={()=>void play()}>Retry recording</button></p>}
 </section>;
}
