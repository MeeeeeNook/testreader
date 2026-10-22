import React, { useRef, useState } from 'react';
import { Play } from 'lucide-react';

export function ListeningAudio({src,exam}:{src:string;exam:boolean}) {
  const audio=useRef<HTMLAudioElement>(null);
  const [started,setStarted]=useState(false),[ended,setEnded]=useState(false),[error,setError]=useState('');
  if(!exam)return <audio controls preload="metadata" src={src}/>;
  return <div className="exam-audio"><audio ref={audio} src={src} preload="metadata" onEnded={()=>setEnded(true)} onError={()=>setError('Audio could not load. Please check your connection.')} />
    <button className="studio-secondary" disabled={started||ended} onClick={async()=>{try{await audio.current?.play();setStarted(true);setError('');}catch{setError('Audio could not start. Please retry.');}}}><Play size={16}/>{ended?'Audio complete':started?'Audio playing':'Start audio'}</button><small>Exam mode · one play, no pause or seeking</small>{error&&<p role="alert">{error}</p>}
  </div>;
}
