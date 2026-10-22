import React from 'react';
import {Modal} from './Modal';
import { BookOpen, CheckCircle2, Dumbbell, Play, ShieldCheck, SlidersHorizontal, Timer, X } from 'lucide-react';
import { Select } from './Select';
import { examMinutes } from '../services/sessionSettings';
import type { EditableTest } from '../types';

export function TestSetup({test,mode,minutes,section,onMode,onMinutes,onSection,onStart,onClose}: {
  test:EditableTest;mode:'practice'|'exam';minutes:number;section:'all'|number;
  onMode:(mode:'practice'|'exam')=>void;onMinutes:(minutes:number)=>void;onSection:(section:'all'|number)=>void;onStart:()=>void;onClose:()=>void;
}) {
  const selected = section === 'all' ? test : {...test,parts:[test.parts[section]]};
  const limit = examMinutes(selected);
  return <Modal className={`test-setup ${mode}`} label="Choose your test mode" onClose={onClose}>
    <header><div><span className="setup-badge"><BookOpen size={20}/>{section === 'all' ? test.skill.toUpperCase() : `${test.skill==='reading'?'PASSAGE':'SECTION'} ${section+1}`}</span><h1>{section==='all'?test.title:test.parts[section].title}</h1><p>Choose how you want to practise before you begin.</p></div><button className="setup-close" aria-label="Close test setup" onClick={onClose}><X/></button></header>
    <div className="setup-body"><h2><SlidersHorizontal size={21}/> Choose a mode</h2><div className="mode-cards">
      {(['practice','exam'] as const).map(value=><button key={value} className={`mode-card ${mode===value?'selected':''}`} aria-pressed={mode===value} onClick={()=>onMode(value)}><span className="mode-card-title">{value==='practice'?<Dumbbell/>:<Timer/>}{value==='practice'?'Practice mode':'Exam mode'}{mode===value&&<CheckCircle2 className="mode-check"/>}</span><span>{value==='practice'?'Choose your time limit, pause the clock, replay audio and use the dictionary.':'A timed IELTS simulation. The dictionary is disabled and listening audio plays once.'}</span></button>)}
    </div>
    {test.parts.length>1&&<label className="studio-field setup-section">Test section<Select value={section} onChange={e=>onSection(e.target.value==='all'?'all':Number(e.target.value))}><option value="all">Complete test · {test.parts.length} sections</option>{test.parts.map((part,i)=><option key={part.id} value={i}>{i+1}. {part.title}</option>)}</Select></label>}
    {mode==='practice'?<div className="practice-options"><h2><SlidersHorizontal size={21}/> Practice settings</h2><p>Time limit</p><div className="time-choices">{[15,20,60,0].map(value=><button key={value} className={minutes===value?'selected':''} aria-pressed={minutes===value} onClick={()=>onMinutes(value)}>{value?`${value} minutes`:'Unlimited'}</button>)}</div><div className="setup-info"><BookOpen size={24}/><div><strong>Dictionary and reading tools included</strong><p>Look up words, highlight passages and take notes while you practise.</p></div></div></div>:<div className="setup-exam-notice"><ShieldCheck/><p>The timer counts down from <strong>{limit} minutes</strong>. Audio plays once, and dictionary lookup is disabled until submission.</p></div>}
    <p className="setup-account-note">All tests, answers and downloads are open to everyone. Sign in to save vocabulary and test results.</p></div>
    <footer><button className="studio-secondary" onClick={onClose}>Cancel</button><button className="studio-primary" onClick={onStart}><Play size={18}/>Start {mode==='practice'?'practice':'exam'}</button></footer>
  </Modal>;
}
