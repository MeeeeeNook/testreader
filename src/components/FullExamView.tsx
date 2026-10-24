import React,{useState} from 'react';
import {FullExamSession} from './FullExamSession';
import {ArrowRight,Headphones,BookOpen,Link as LinkIcon,Clock,CheckCircle2} from 'lucide-react';
import type {EditableTest,TestMeta,UserProfile,VocabularyItem,AttemptRecord} from '../types';
import {firestoreAdapter} from '../services/firestoreAdapter';
import {auth} from '../firebase';
import {requestJson} from '../services/apiRequest';
import {fullExamLink,fullExamStorageKey,readFullExamDraft,isFullExamTest,type FullExamDraft,type StageSubmission} from '../services/fullExam';
import {createId} from '../services/ids';
import {saveAttempt} from '../services/localHistory.js';
import {shareTest} from '../services/shareTest';
import {cleanLayout} from '../services/importer';
import {QuestionLayout,AnswerControl} from './QuestionLayout';
import {Select} from './Select';
import {TestWorkspace} from './TestWorkspace';
import {ListeningAudio} from './ListeningAudio';
interface Props {tests:TestMeta[];profile:UserProfile;location:string;onNavigate:(path:string)=>void;onNotify:(message:string)=>void;onSaveVocabulary:(word:Partial<VocabularyItem>)=>Promise<void>;onHistorySaved:()=>void}
export function FullExamView({tests,profile,location,onNavigate,onNotify,onSaveVocabulary,onHistorySaved}:Props){
 const params=new URL(location,'https://ielts.local').searchParams;
 const [listening,setListening]=useState(params.get('listening')||''),[reading,setReading]=useState(params.get('reading')||'');
 const [draft,setDraft]=useState<FullExamDraft|null>(()=>profile.id==='guest'?null:readFullExamDraft(localStorage,profile.id));
 const [active,setActive]=useState(false),[definitions,setDefinitions]=useState<{listening:EditableTest;reading:EditableTest}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [review,setReview]=useState<'listening'|'reading'|null>(null);
 const [running,setRunning]=useState(false);
 const owner=profile.id;
 const persist=(next:FullExamDraft)=>{if(auth.currentUser?.uid!==owner)throw Error('Sign in with the same account to continue this full test.');localStorage.setItem(fullExamStorageKey(owner),JSON.stringify(next));setDraft(next)};
 const load=async(next:FullExamDraft)=>{
  setBusy(true);setError('');try{
   if(auth.currentUser?.uid!==owner)throw Error('Sign in to take a full test.');
   const [l,r]=await Promise.all([firestoreAdapter.getTestComplete(next.listening),firestoreAdapter.getTestComplete(next.reading)]);
   for(const t of [l,r]){if(t.status!=='published'||t.parts.length!==(t.skill==='listening'?4:3)||t.parts.reduce((n,p)=>n+p.questions.length,0)!==40)throw Error('A selected test is incomplete or unavailable. Choose another test.');if(next.testVersions?.[t.id]&&next.testVersions[t.id]!==t.updatedAt)throw Error('This test was edited since you started. Start a new full test to use the latest questions.');}
   if(l.skill!=='listening'||r.skill!=='reading')throw Error('Choose Listening first and Reading second.');
   const ready={...next,testVersions:{[l.id]:l.updatedAt,[r.id]:r.updatedAt}};persist(ready);setDefinitions({listening:l,reading:r});setActive(true);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const complete=async(submission:StageSubmission)=>{
  if(!draft||!definitions)throw Error('Your full test could not be found.');
  if(draft.stage==='listening'){persist({...draft,listeningAnswers:submission,stage:'reading'});setRunning(false);window.scrollTo({top:0});return;}
  if(!draft.listeningAnswers)throw Error('Complete Listening before Reading.');
  const pending={...draft,readingAnswers:submission};persist(pending);
  const results=await requestJson<any>('/api/full-exam/submit',{listening:{testId:draft.listening,responses:draft.listeningAnswers.responses},reading:{testId:draft.reading,responses:submission.responses}},()=>auth.currentUser);
  if(auth.currentUser?.uid!==owner)throw Error('Your account changed. Sign in again to save these results.');
  // Stable attempt IDs make retrying the final submission safe for history.
  const attemptIds=['listening','reading'].map(skill=>'full_'+draft.id+'_'+skill);
  for(const [i,skill]of (['listening','reading'] as const).entries()){
   const answers=skill==='listening'?draft.listeningAnswers:submission,test=definitions[skill];
   const record:AttemptRecord={id:attemptIds[i],owner,testId:test.id,testTitle:test.title+' · Full test',skill,mode:'exam',createdAt:submission.completedAt,startedAt:answers.startedAt,completedAt:submission.completedAt,elapsedSeconds:answers.elapsedSeconds,responses:answers.responses,result:results[skill].result,band:results[skill].band,fullExamId:draft.id};
   saveAttempt(localStorage,owner,record);
  }
  persist({...pending,stage:'results',results,attemptIds});setRunning(false);onHistorySaved();window.dispatchEvent(new Event('study-history-change'));window.scrollTo({top:0});
 };
 const listeningTests=tests.filter(t=>isFullExamTest(t,'listening')),readingTests=tests.filter(t=>isFullExamTest(t,'reading'));
 if(owner==='guest')return <section className="full-exam-page studio-panel"><span className="portal-eyebrow">LISTENING + READING</span><h1>Your full IELTS test</h1><p>Choose a Listening test and a Reading test, then complete them in order. Sign in to save your progress and results.</p><a className="studio-primary" href={'/sign-in?next='+encodeURIComponent(location)}>Sign in to continue</a></section>;
 if(active&&draft&&definitions&&draft.stage!=='results')return <FullExamSession><div className="full-exam-stagebar"><span className={draft.stage==='listening'?'active':'complete'}>1 · Listening · 40 min</span><ArrowRight size={16}/><span className={draft.stage==='reading'?'active':''}>2 · Reading · 60 min</span><span>Scores after both tests</span></div>{draft.stage==='reading'&&!running?<section className="full-exam-transition studio-panel"><CheckCircle2 size={35}/><h1>Listening complete.</h1><p>Your answers are saved. Next: {definitions.reading.title}. You have 60 minutes for Reading.</p><button className="studio-primary" onClick={()=>setRunning(true)}>Start Reading <ArrowRight size={17}/></button></section>:<TestWorkspace key={draft.id+draft.stage} test={definitions[draft.stage]} sessionId={'full_'+draft.id+'_'+draft.stage} profile={profile} mode="exam" initialDurationMinutes={draft.stage==='listening'?40:60} onSessionActive={setRunning} onHistorySaved={onHistorySaved} onReturnToLibrary={()=>{setActive(false);setRunning(false)}} onSaveVocabulary={onSaveVocabulary} onNotify={onNotify} onStageComplete={complete} stageLabel={draft.stage==='listening'?'Finish Listening and continue to Reading?':'Submit Listening and Reading?'}/>}</FullExamSession>;
 if(active&&draft?.stage==='results'&&draft.results&&definitions)return <section className="full-exam-results"><span className="portal-eyebrow">FULL TEST COMPLETE</span><h1>Two skills. One finished challenge.</h1><p>Your Listening and Reading results are saved to your history.</p><div className="full-exam-result-grid">{(['listening','reading'] as const).map(skill=>{const result=draft.results[skill];return <article className="studio-panel" key={skill}><h2>{skill==='listening'?'Listening':'Reading'}</h2><strong className="full-exam-band">{result.band==null?'—':result.band.toFixed(1)}</strong><p>{result.result.correct} / {result.result.total} correct · estimated band</p><button className="studio-secondary" onClick={()=>setReview(review===skill?null:skill)}>Review {skill}</button></article>})}</div><p>These are practice estimates for two skills, not an overall four-skill IELTS band.</p>{review&&<FullExamReview key={review} test={definitions[review]} answers={(review==='listening'?draft.listeningAnswers:draft.readingAnswers)!.responses} assessment={draft.results[review]}/>}<div className="studio-actions"><button className="studio-secondary" onClick={()=>{setActive(false);setReview(null)}}>Create another full test</button><button className="studio-primary" onClick={()=>onNavigate('/history')}>View history</button></div></section>;
 return <div className="full-exam-page"><header className="portal-page-heading"><div><span className="portal-eyebrow">YOUR COMPLETE CHALLENGE</span><h1>Create a full test</h1><p>Listening first, Reading next. Get both scores when you finish.</p></div></header><div className="full-exam-builder"><section className="studio-panel"><div className="full-exam-choice"><Headphones size={25}/><div><h2>01 · Listening</h2><p>4 parts · 40 questions · 40 minutes</p></div></div><label>Choose Listening test<Select aria-label="Full exam listening test" value={listening} onChange={e=>setListening(e.target.value)}><option value="">Select a full Listening test</option>{listeningTests.map(t=><option key={t.id} value={t.id}>{t.title} · {t.folderPath||t.source}</option>)}</Select></label><div className="full-exam-choice"><BookOpen size={25}/><div><h2>02 · Reading</h2><p>3 passages · 40 questions · 60 minutes</p></div></div><label>Choose Reading test<Select aria-label="Full exam reading test" value={reading} onChange={e=>setReading(e.target.value)}><option value="">Select a full Reading test</option>{readingTests.map(t=><option key={t.id} value={t.id}>{t.title} · {t.folderPath||t.source}</option>)}</Select></label></section><aside className="studio-panel full-exam-summary"><Clock size={28}/><h2>100 minutes.<br/>One focused session.</h2><p>Each skill has its own timer. Listening cannot be revisited once you continue to Reading. A timer reaching zero submits that skill automatically.</p><p>Audio downloads fully before the Listening timer starts. Your answers are saved on this device.</p><button className="studio-primary" disabled={busy||!listeningTests.some(t=>t.id===listening)||!readingTests.some(t=>t.id===reading)} onClick={()=>void load({version:1,id:createId(),listening,reading,stage:'listening'})}>{busy?'Preparing…':'Start full test'}<ArrowRight size={17}/></button><button className="studio-secondary" disabled={!listening||!reading} onClick={()=>void shareTest(fullExamLink(listening,reading),'IELTS Listening + Reading full test').then(onNotify).catch(e=>setError(e.message))}><LinkIcon size={17}/>Generate & share link</button><a href="/mock">Build a test from individual parts</a></aside></div>{error&&<p role="alert" className="studio-callout">{error}</p>}{draft&&<section className="studio-panel full-exam-resume"><h2>{draft.stage==='results'?'Last full test results':'Continue your full test'}</h2><p>{tests.find(t=>t.id===draft.listening)?.title||'Listening'} → {tests.find(t=>t.id===draft.reading)?.title||'Reading'}</p><button className="studio-secondary" disabled={busy} onClick={()=>void load(draft)}>{draft.stage==='results'?'Open results':'Resume '+draft.stage}</button></section>}</div>;
}
function FullExamReview({test,answers,assessment}:{test:EditableTest;answers:Record<string|number,string>;assessment:any}){
 const [index,setIndex]=useState(0);const part=test.parts[index];
 const reviewed={...part,passageHtml:assessment.transcripts?.[part.id]??part.passageHtml,questions:part.questions.map(q=>({...q,...assessment.keys[q.number]}))};
 const control=(id:string)=>reviewed.slots[id]?<AnswerControl slot={reviewed.slots[id]} part={reviewed} responses={answers} showAnswers disabled onChange={()=>{}} onMultiChange={()=>{}}/>:null;
 return <section className="studio-panel full-exam-review"><h2>Review {test.title}</h2>{test.skill==='listening'&&<ListeningAudio parts={test.parts} exam={false}/>}<nav className="collection-view-tabs">{test.parts.map((p,i)=><button key={p.id} className={i===index?'active':''} onClick={()=>{setIndex(i)}}>{test.skill==='listening'?'Part':'Passage'} {i+1}</button>)}</nav><div className="full-exam-review-columns"><article><h3>{test.skill==='listening'?'Transcript':'Passage'}</h3><div dangerouslySetInnerHTML={{__html:cleanLayout(reviewed.passageHtml)}}/></article><article><h3>Questions & answers</h3><QuestionLayout html={part.questionHtml} renderSlot={control}/>{Object.values(part.slots).filter(slot=>!part.questionHtml.includes('data-slot="'+slot.id+'"')&&!part.questionHtml.includes("data-slot='"+slot.id+"'")).map(slot=><div key={slot.id}>{control(slot.id)}</div>)}<h3>Explanations</h3>{reviewed.questions.map(q=><div key={q.number}><strong>{q.number}. {assessment.result.rows.find((r:any)=>r.number===q.number)?.status}</strong><div dangerouslySetInnerHTML={{__html:cleanLayout(q.explanationHtml||'')}}/></div>)}</article></div></section>;
}
