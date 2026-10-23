import {BookOpen,Headphones,Shuffle,ArrowRight,Check,Clock,Layers,ShieldCheck,SlidersHorizontal} from 'lucide-react';
import {Select} from "./Select";
import React, { useState, useEffect } from 'react';
import { TestMeta, EditableTest, EditablePart } from '../types';
import { firestoreAdapter } from '../services/firestoreAdapter';

interface MockBuilderViewProps {
  tests: TestMeta[];
  onStartSession: (test: EditableTest, mode: 'practice' | 'exam', durationMinutes: number) => void;
  onNotify: (msg: string) => void;
}

export const MockBuilderView: React.FC<MockBuilderViewProps> = ({
  tests,
  onStartSession,
  onNotify,
}) => {
  const [skill, setSkill] = useState<'reading' | 'listening'>('reading');
  const [mode, setMode] = useState<'practice' | 'exam'>('exam');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');

  const published = tests.filter((t) => t.status === 'published' && !t.deletedAt && t.skill === skill);
  const count = skill === 'listening' ? 4 : 3;

  // Selected tests and part indices for each section
  const [selections, setSelections] = useState<{ testId: string; partIndex: number }[]>([
    { testId: published[0]?.id || '', partIndex: 0 },
    { testId: published[1]?.id || published[0]?.id || '', partIndex: 1 },
    { testId: published[2]?.id || published[0]?.id || '', partIndex: 2 },
    { testId: published[3]?.id || published[0]?.id || '', partIndex: 3 },
  ]);

  const publishedKey = published.map(t => t.id).join('|');
  useEffect(() => {
    setSelections(prev => Array.from({ length: count }, (_, i) => {
      const selected = prev[i];
      return published.some(t => t.id === selected?.testId && selected.partIndex<(t.passages||1)) ? selected : { testId: published[i % (published.length || 1)]?.id || '', partIndex: 0 };
    }));
  }, [publishedKey, count]);

  const [passageNames, setPassageNames] = useState<Record<string, string[]>>({});
  const selectedIds = [...new Set(selections.map(s => s.testId).filter(Boolean))].sort().join('|');
  useEffect(() => {
    let cancelled = false;
    const ids = selectedIds.split('|').filter(Boolean);
    void Promise.all(ids.map(async id => {
      try {
        const full = await firestoreAdapter.getTestComplete(id);
        if (!cancelled) setPassageNames(previous => ({...previous, [id]: full.parts.map(p => p.title)}));
      } catch { /* Compilation reports unavailable tests when the learner starts. */ }
    }));
    return () => { cancelled = true; };
  }, [selectedIds]);

  const handleTestChange = (sectionIdx: number, testId: string) => {
    setSelections((prev) => {
      const next = [...prev];
      next[sectionIdx] = { testId, partIndex: 0 };
      return next;
    });
  };

  const handlePartChange = (sectionIdx: number, partIndex: number) => {
    setSelections((prev) => {
      const next = [...prev];
      next[sectionIdx] = { ...next[sectionIdx], partIndex };
      return next;
    });
  };

  const handleRandomize = () => {
    if (!published.length) {
      onNotify('There are no published tests for this skill yet.');
      return;
    }
    const pool=published.flatMap(test=>Array.from({length:test.passages||1},(_,partIndex)=>({testId:test.id,partIndex})));
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    if(pool.length<count){onNotify('There are not enough different sections for a full mock yet.');return;}
    const next=pool.slice(0,count);
    setSelections(next);
    onNotify('Sections randomized.');
  };

  const handleStartMock = async () => {
    if(busy)return;
    if (!published.length) {
      onNotify('No published tests available to build a mock.');
      return;
    }

    setBusy(true);setError('');
    try {
      const compiledParts: EditablePart[] = [];
      const sourceSections: { testId: string; sectionId: string }[] = [];
      const usedKeys = new Set<string>();

      for (let i = 0; i < count; i++) {
        const sel = selections[i];
        if (!sel?.testId) {
          throw new Error(`Please select a test for Section ${i + 1}.`);
        }
        const key = `${sel.testId}:${sel.partIndex}`;
        if (usedKeys.has(key)) {
          throw new Error('Please choose distinct sections for each part of the mock test.');
        }
        usedKeys.add(key);

        const fullTest = await firestoreAdapter.getTestComplete(sel.testId);
        const partToCopy = fullTest.parts[sel.partIndex];
        if(skill==='listening'&&partToCopy&&fullTest.parts.filter(p=>p.audio===partToCopy.audio).length>1&&!partToCopy.audioEnd&&!fullTest.parts[sel.partIndex+1]?.audioStart)throw new Error('This recording needs part dividers before it can be mixed. Ask the administrator to add timestamps.');
        if (!partToCopy) {
          throw new Error(`Section ${sel.partIndex + 1} not found in test ${fullTest.title}.`);
        }
        sourceSections.push({ testId: sel.testId, sectionId: partToCopy.id });
        compiledParts.push({ ...JSON.parse(JSON.stringify({...partToCopy,audioEnd:partToCopy.audioEnd||(fullTest.parts[sel.partIndex+1]?.audio===partToCopy.audio?fullTest.parts[sel.partIndex+1]?.audioStart:undefined)})), id: `p${i}`, position:i+1 });
      }

      // Renumber questions sequentially 1..40 across all selected parts
      let currentNumber = 1;
      for (const p of compiledParts) {
        const mapping = new Map<number, number>();
        p.questions.forEach((q) => {
          mapping.set(q.number, currentNumber++);
        });

        p.questions.forEach((q) => {
          q.number = mapping.get(q.number) || q.number;
        });

        Object.values(p.slots).forEach((slot) => {
          slot.numbers = slot.numbers.map((n) => mapping.get(n) || n);
        });

        // Update instruction numbers inside question layout text
        for (const k of ['passageHtml', 'questionHtml'] as const) {
          p[k] = p[k].replace(
            /(Questions?\s+)(\d+)(\s*[-–—]\s*)(\d+)/gi,
            (match, word, a, dash, b) => {
              const numA = Number(a);
              const numB = Number(b);
              if (mapping.has(numA) && mapping.has(numB)) {
                return `${word}${mapping.get(numA)}${dash}${mapping.get(numB)}`;
              }
              return match;
            }
          );
        }
      }

      const mockTest: EditableTest = {
        schemaVersion: 1,
        id: `mock_${Date.now()}`,
        title: `IELTS ${skill === 'reading' ? 'Academic Reading' : 'Listening'} Full Mock Test`,
        skill,
        source: 'Custom Mock',
        access: 'free',
        status: 'published',
        duration: skill === 'reading' ? 60 : 30,
        parts: compiledParts,
        sourceSections,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      onStartSession(mockTest, mode, mode==='practice'?0:mockTest.duration);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }finally{setBusy(false);}
  };

  const minutes=skill==='reading'?60:30,unit=skill==='reading'?'Passage':'Part';
  return <div className="mock-builder">
    <header className="mock-page-heading"><span className="portal-eyebrow">YOUR TEST, YOUR WAY</span><h1>Make room for your next milestone.</h1><p>Bring your favourite passages together in one focused IELTS session.</p></header>
    <div className="mock-layout"><div className="mock-main">
      <section className="mock-settings" aria-label="Test settings"><div className="mock-section-heading"><span>01</span><div><h2>Set your focus</h2><p>A little practice, or the full challenge.</p></div></div>
        <div className="mock-skill-options">{(['reading','listening'] as const).map(value=><button key={value} aria-pressed={skill===value} className={skill===value?'selected':''} onClick={()=>{setSkill(value);setError('');}}>{value==='reading'?<BookOpen size={22}/>:<Headphones size={22}/>}<span><strong>{value==='reading'?'Academic Reading':'Listening'}</strong><small>{value==='reading'?'3 passages · 60 minutes':'4 parts · 30 minutes'}</small></span>{skill===value&&<Check size={17}/>}</button>)}</div>
        <div className="mock-mode-options" aria-label="Session mode">{(['practice','exam'] as const).map(value=><button key={value} aria-pressed={mode===value} className={mode===value?'selected':''} onClick={()=>setMode(value)}>{value==='practice'?<SlidersHorizontal size={18}/>:<ShieldCheck size={18}/>}<span><strong>{value==='practice'?'Practice':'Exam'}</strong><small>{value==='practice'?'Unlimited time, reading tools on':'Timed, with exam conditions'}</small></span></button>)}</div>
      </section>
      <section className="mock-passages" aria-label="Choose passages"><div className="mock-section-heading"><span>02</span><div><h2>Choose your {skill==='reading'?'passages':'parts'}</h2><p>Pick from the library, or let us surprise you.</p></div><button className="mock-shuffle" disabled={!published.length||busy} onClick={handleRandomize}><Shuffle size={15}/>Shuffle</button></div>
        {!published.length?<div className="portal-empty"><BookOpen size={30}/><p>No published {skill} tests yet. Try the other skill.</p></div>:Array.from({length:count},(_,index)=>{
          const selection=selections[index],test=published.find(test=>test.id===selection?.testId);
          const title=passageNames[selection?.testId]?.[selection?.partIndex]||test?.passageTitles?.[selection?.partIndex];
          return <article className="mock-passage-card" key={skill+index}><div className="mock-passage-heading"><span>{String(index+1).padStart(2,'0')}</span><div><small>{unit.toUpperCase()} {index+1}</small><h3>{title||'Choose a '+unit.toLowerCase()}</h3></div></div><div className="mock-passage-fields"><label>From test<Select aria-label={unit+' '+(index+1)+' test'} value={selection?.testId||''} onChange={event=>handleTestChange(index,event.target.value)}>{published.map(test=><option key={test.id} value={test.id}>{test.title} · {test.folderPath||test.source||'Library'}</option>)}</Select></label><label>{unit}<Select aria-label={unit+' '+(index+1)+' selection'} value={selection?.partIndex??0} onChange={event=>handlePartChange(index,Number(event.target.value))}>{Array.from({length:test?.passages||1},(_,part)=><option key={part} value={part}>{part+1}. {passageNames[selection?.testId]?.[part]||test?.passageTitles?.[part]||unit+' '+(part+1)}</option>)}</Select></label></div></article>;
        })}
      </section>
    </div><aside className="mock-summary"><span className="mock-summary-icon"><Layers size={26}/></span><span className="portal-eyebrow">READY WHEN YOU ARE</span><h2>Your next<br/><em>challenge.</em></h2><dl><div><dt>Focus</dt><dd>{skill==='reading'?'Academic Reading':'Listening'}</dd></div><div><dt>Format</dt><dd>{count} {unit.toLowerCase()}s</dd></div><div><dt>Time</dt><dd><Clock size={14}/>{mode==='practice'?'Unlimited':minutes+' minutes'}</dd></div><div><dt>Mode</dt><dd>{mode==='practice'?'Practice':'Exam'}</dd></div></dl><button className="studio-primary" disabled={busy||!published.length} onClick={()=>void handleStartMock()}>{busy?'Preparing your test…':'Start '+(mode==='practice'?'practice':'mock test')}<ArrowRight size={17}/></button>{error&&<p role="alert" className="mock-error">{error}</p>}<p className="mock-summary-note">{mode==='practice'?'Take your time. Look up words, pause and review your answers when you finish.':'Your timer starts when the test opens. Answers and explanations appear after you submit.'}</p><small>Question totals follow your chosen passages. Band estimates are available for tests with 40 questions.</small></aside></div>
  </div>;
};
