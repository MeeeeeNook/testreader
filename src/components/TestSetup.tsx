import {testIntroductionPath,visibleTestSource} from '../services/testUrls.js';
import React from 'react';
import {ShareButton} from './ShareButton';
import {setupLink} from '../services/sessionSettings';
import {TestCover} from './TestCover';
import type {AttemptRecord} from '../types';
import { BookOpen, CheckCircle2, Dumbbell, Play, ShieldCheck, SlidersHorizontal, Timer, X } from 'lucide-react';
import { Select } from './Select';
import { examMinutes } from '../services/sessionSettings';
import type { EditableTest } from '../types';

export function TestSetup({test,mode,minutes,section,onMode,onMinutes,onSection,onStart,onClose,attempts=[]}: {
  attempts?:AttemptRecord[];
  test:EditableTest;mode:'practice'|'exam';minutes:number;section:'all'|number;
  onMode:(mode:'practice'|'exam')=>void;onMinutes:(minutes:number)=>void;onSection:(section:'all'|number)=>void;onStart:()=>void;onClose:()=>void;
}) {
  const selected = section === 'all' ? test : {...test,parts:[test.parts[section]],duration:test.skill==='listening'?10:test.duration};
  const limit = examMinutes(selected);
  return <article className={`test-setup test-introduction ${mode}`}>
    <nav className="intro-breadcrumb"><a href="/practice">Practice library</a><span>/</span><span>{test.skill==='listening'?'Listening':'Reading'}</span></nav>
    <div className="intro-overview"><TestCover id={test.id} title={test.title} image={test.coverImage} skill={test.skill}/><div><span className="portal-eyebrow">IELTS {test.skill.toUpperCase()} PRACTICE</span><h1>{section==='all'?test.title:test.skill==='listening'?test.title+' · Part '+(section+1):test.parts[section].title}</h1>{visibleTestSource(test.source)&&<p>{visibleTestSource(test.source)}</p>}<div className="intro-facts"><span>{selected.parts.reduce((n,p)=>n+p.questions.length,0)} questions</span><span>{limit} minutes in test mode</span><span>{selected.parts.length} {test.skill==='listening'?'parts':'passages'}</span></div><p>Practise at your own pace or take a timed test. Review your score, answers and explanations after submitting.</p><ShareButton path={testIntroductionPath(test,section==='all'?undefined:test.parts[section].id)} title={test.title}/></div></div>
    <div className="setup-body"><h2><SlidersHorizontal size={21}/> Choose a mode</h2><div className="mode-cards">
      {(['practice','exam'] as const).map(value=><button key={value} className={`mode-card ${mode===value?'selected':''}`} aria-pressed={mode===value} onClick={()=>onMode(value)}><span className="mode-card-title">{value==='practice'?<Dumbbell/>:<Timer/>}{value==='practice'?'Practice mode':'Exam mode'}{mode===value&&<CheckCircle2 className="mode-check"/>}</span><span>{value==='practice'?'Choose your time limit, pause the clock, replay audio and use the dictionary.':'A timed IELTS simulation. The dictionary is disabled and listening audio plays once.'}</span></button>)}
    </div>
    {test.parts.length>1&&<label className="studio-field setup-section">Test part<Select value={section} onChange={e=>onSection(e.target.value==='all'?'all':Number(e.target.value))}><option value="all">Complete test · {test.parts.length} parts</option>{test.parts.map((part,i)=><option key={part.id} value={i}>{test.skill==='listening'?'Part '+(i+1):(i+1)+'. '+part.title}</option>)}</Select></label>}
    {mode==='practice'?<div className="practice-options"><h2><SlidersHorizontal size={21}/> Practice settings</h2><p>Time limit</p><div className="time-choices">{(test.skill==='listening'?[10,20,40,0]:[15,20,60,0]).map(value=><button key={value} className={minutes===value?'selected':''} aria-pressed={minutes===value} onClick={()=>onMinutes(value)}>{value?`${value} minutes`:'Unlimited'}</button>)}</div><div className="setup-info"><BookOpen size={24}/><div><strong>Practice tools included</strong><p>Look up words, highlight passages and take notes while you practise.</p></div></div></div>:<div className="setup-exam-notice"><ShieldCheck/><p>The timer counts down from <strong>{limit} minutes</strong>. {test.skill==='listening'?'This includes checking time. Audio plays once, and dictionary lookup is disabled until submission.':'The test submits automatically when time runs out. Dictionary lookup is disabled until submission.'}</p></div>}
</div>
    <footer><button className="studio-secondary" onClick={onClose}>Cancel</button><button className="studio-primary" onClick={onStart}><Play size={18}/>Start {mode==='practice'?'practice':'exam'}</button></footer>
    <section className="intro-history"><h2>Your test history</h2>{attempts.filter(a=>a.testId===test.id&&(section==='all'||!a.sectionIds?.length||a.sectionIds.includes(test.parts[section].id))).slice(0,5).map(a=><p key={a.id}>{new Date(a.completedAt||a.createdAt).toLocaleString()} · {a.mode==='exam'?'Test mode':'Practice mode'} · {a.result.correct}/{a.result.total}</p>)}{!attempts.some(a=>a.testId===test.id)&&<p>Your completed attempts for this test will appear here.</p>}</section>
  </article>;
}
