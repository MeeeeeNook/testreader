import {normalizePassageHeadings} from '../services/passageFormatting';
import {ShareButton} from './ShareButton';
import {introductionLink} from '../services/shareTest';
import {AnswerSheet} from './AnswerSheet';
import {ResultScreen} from './ResultScreen';
import {ScoreAnalysis} from './ScoreAnalysis';
import {Modal} from "./Modal";
import {FontSizeSlider,readingSize} from "./FontSizeSlider";
import {readerSessionKey,readReaderSession} from "../services/readerSession";
import {requestJson} from "../services/apiRequest";
import {preloadRecordings} from "../services/audioPreload";
import {ListeningAudio,playbackSpeeds} from "./ListeningAudio";
import {Select} from "./Select";
import {paintHighlights,selectionOffsets} from "../services/highlights";
import {lookupVocabulary} from "../services/dictionary";
import {DictionaryPanel} from "./DictionaryPanel";
import {ExportDialog} from "./ExportDialog";
import {testLink} from "../services/testLinks";
import {BookOpen,Printer,NotebookPen,Flag,Settings2,ArrowLeft,RotateCcw,AlarmClock,Pause,Play,Bug,Infinity as InfinityIcon} from "lucide-react";
import { loginWithGoogle } from "../services/auth";
import { passageTitle } from "../services/passageTitle";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { createId } from "../services/ids";
import { assessmentRequest } from "../services/assessmentClient";
import React, { useState, useEffect, useRef } from "react";
import {
  EditableTest,
  EditablePart,
  TestSlot,
  ScoreResult,
  ScoreRow,
  UserProfile,
  StudyNote,
  StudyHighlight,
  AttemptRecord,
} from "../types";
import { AnswerControl, QuestionLayout } from "./QuestionLayout";
import { cleanLayout } from "../services/importer";
import { saveAttempt } from "../services/localHistory.js";
import { auth } from "../firebase";
import { firestoreAdapter } from "../services/firestoreAdapter";
import { scoreTest, estimatedBand } from "../services/scoring";

interface TestWorkspaceProps {
  onStageComplete?:(submission:import('../services/fullExam').StageSubmission)=>Promise<void>;
  stageLabel?:string;
  audioReady?:boolean;
  audioProgress?:React.ReactNode;
  audioSources?:Record<string,string>;
  initialSolution?: boolean;
  onRetake?:()=>void;
  test: EditableTest;
  sessionId: string;
  onSessionActive: (active: boolean) => void;
  onHistorySaved: () => void;
  mode: "practice" | "exam";
  initialDurationMinutes: number;
  profile: UserProfile;
  isPreview?: boolean;
  onReturnToLibrary: () => void;
  onSaveVocabulary: (item: {
    word: string;
    meaning: string;
    example: string;
    partOfSpeech: string;
  }) => Promise<void>;
  onNotify: (msg: string) => void;
}

export const TestWorkspace: React.FC<TestWorkspaceProps> = (props) => {
 const needsAudio=props.test.skill==='listening';
 const [sources,setSources]=useState<Record<string,string>|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[progress,setProgress]=useState({done:0,total:0,bytes:0});
 const urls=JSON.stringify([...new Set(props.test.parts.map(p=>p.audio).filter((u):u is string=>!!u))]);
 useEffect(()=>{
  if(!needsAudio)return;
  const controller=new AbortController();let alive=true;let owned:Record<string,string>={};setSources(null);setError('');setProgress({done:0,total:JSON.parse(urls).length,bytes:0});
  const timeout=setTimeout(()=>controller.abort(new Error('Audio loading timed out. Check your connection and retry.')),180000);
  void preloadRecordings(JSON.parse(urls),controller.signal,(done,total,bytes)=>setProgress({done,total,bytes})).then(result=>{owned=result;if(controller.signal.aborted)Object.values(result).forEach(URL.revokeObjectURL);else setSources(result)}).catch(e=>{if(alive)setError(e.message||'Audio could not load. Retry before starting the test.')}).finally(()=>clearTimeout(timeout));
  return()=>{alive=false;clearTimeout(timeout);controller.abort();Object.values(owned).forEach(URL.revokeObjectURL)};
 },[needsAudio,urls,retry,props.sessionId]);
 const ready=!needsAudio||sources!==null;
 const loading=needsAudio&&!ready?<div className="audio-background-progress" aria-live="polite"><span>{error?'Audio download failed':`Downloading all audio · ${progress.done}/${progress.total} files · ${(progress.bytes/1048576).toFixed(1)} MB`}</span>{error?<><span role="alert">{error}</span><button onClick={()=>setRetry(r=>r+1)}>Retry audio</button></>:<><progress max={progress.total||1} value={progress.done}/><small>Browse the questions now. Playback and the timer start when all recordings are downloaded.</small></>}</div>:null;
 return <LoadedTestWorkspace key={props.sessionId} {...props} audioSources={sources||{}} audioReady={ready} audioProgress={loading}/>;
};
const LoadedTestWorkspace: React.FC<TestWorkspaceProps> = ({
  onStageComplete,
  stageLabel,
  audioSources={},
  audioReady=true,
  audioProgress,
  test,
  initialSolution=false,
  onRetake,
  sessionId,
  onSessionActive,
  onHistorySaved,
  mode,
  initialDurationMinutes,
  profile,
  isPreview = false,
  onReturnToLibrary,
  onSaveVocabulary,
  onNotify,
}) => {
  const [volume,setVolume]=useState(.8),[audioSpeed,setAudioSpeed]=useState(4);
  const [dictionaryWord,setDictionaryWord]=useState<string|null>(null);
  const [dictionaryContext,setDictionaryContext]=useState(''),[dictionarySaveIntent,setDictionarySaveIntent]=useState(false);
  const [showExport,setShowExport]=useState(false);
  const [paneWidth,setPaneWidth]=useState(50);
  const splitRef=useRef<HTMLDivElement>(null);
  const [solutionError,setSolutionError]=useState('');
  const [solutionRetry,setSolutionRetry]=useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [resetAction, setResetAction] = useState<"reset" | "restart" | null>(
    null,
  );
  const [textSize, setTextSize] = useState(
    readingSize(profile.fontSize),
  );
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const sessionKey = readerSessionKey(profile.id,sessionId,mode,initialSolution,isPreview);
  const [savedSession] = useState(()=>readReaderSession(localStorage,sessionKey,initialSolution));
  const [flagMode,setFlagMode]=useState(false);
  const [responses, setResponses] = useState<Record<string | number, string>>(
    savedSession.responses || {},
  );
  const [flags, setFlags] = useState<number[]>(savedSession.flags || []);
  const [notes, setNotes] = useState<StudyNote[]>(savedSession.notes || []);
  const [highlights, setHighlights] = useState<StudyHighlight[]>(
    savedSession.highlights || [],
  );
  const [showAnswers, setShowAnswers] = useState(false);
  const [showExplanations, setShowExplanations] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(
    Number.isFinite(savedSession.remaining)
      ? savedSession.remaining
      : Math.max(0, initialDurationMinutes) * 60,
  );
  const [timerRunning, setTimerRunning] = useState(
    !initialSolution && !savedSession.scored && (mode === "exam" || initialDurationMinutes > 0),
  );
  const [scored, setScored] = useState(Boolean(savedSession.scored));
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(
    savedSession.result || null,
  );
  const [approxBand, setApproxBand] = useState<number | null>(
    savedSession.band ?? null,
  );
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showAnswerSheet,setShowAnswerSheet]=useState(false);
  const [activeDrawer, setActiveDrawer] = useState<"notes" | "review" | null>(
    null,
  );
  const [drawerReviewFilter, setDrawerReviewFilter] = useState<
    "all" | "unanswered" | "flagged"
  >("all");
  const [newNoteText, setNewNoteText] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportQuestion, setReportQuestion] = useState<number>(1);
  const [reportCategory, setReportCategory] = useState("typo");
  const [reportMessage, setReportMessage] = useState("");
  const [showDisplayModal, setShowDisplayModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<"passage" | "questions">(
    "passage",
  );

  // Floating selection tools state
  const [selectionBox, setSelectionBox] = useState<{
    text: string;
    start:number;
    end:number;
    context: string;
    pane: "passage" | "questions";
    x: number;
    y: number;
  } | null>(null);

  const passageRef = useRef<HTMLDivElement>(null);
  const questionsRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{for(const pane of [passageRef.current,questionsRef.current])if(pane)pane.scrollTop=0;},[currentPartIndex]);

  const [reviewKeys, setReviewKeys] = useState<Record<number, any>>(() =>
    Object.fromEntries(
      (savedSession.result?.rows || []).map((row: ScoreRow) => [
        row.number,
        { answer: row.answer },
      ]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const submissionRef = useRef(false);
  const pendingAttempt = useRef<AttemptRecord | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const [reviewLoaded, setReviewLoaded] = useState(false);
  const [transcripts,setTranscripts]=useState<Record<string,string>>(()=>isPreview?Object.fromEntries(test.parts.map(p=>[p.id,p.passageHtml])):{});
  const [audioStop,setAudioStop]=useState(0);
  const [timeUp,setTimeUp]=useState(false);
  const [elapsedSeconds,setElapsedSeconds]=useState(Math.max(0,Number(savedSession.elapsedSeconds)||0));
  const [startedAt,setStartedAt]=useState(Number(savedSession.startedAt)||Date.now());
  const [listeningReview,setListeningReview]=useState(initialSolution||Boolean(savedSession.scored));
  const listeningSolution=test.skill==='listening'&&(initialSolution||listeningReview);

  useEffect(() => {
    onSessionActive(!isPreview && !initialSolution && (!scored || Boolean(historyError)));
    return () => onSessionActive(false);
  }, [isPreview, initialSolution, scored, historyError, onSessionActive]);
  const originalPart = test.parts[currentPartIndex] || test.parts[0];
  const part: EditablePart = {
    ...originalPart,
    questions: originalPart.questions.map((q) => ({
      ...q,
      ...reviewKeys[q.number],
    })),
  };
  useEffect(()=>{
    const roots=([['passage',passageRef.current],['questions',questionsRef.current]] as const).filter(([,root])=>root).map(([pane,root])=>({root:root!,items:highlights.filter(h=>h.part===currentPartIndex&&h.pane===pane)}));
    return paintHighlights(roots);
  },[highlights,currentPartIndex,showExplanations,showAnswers]);
  useEffect(()=>{
    if((!initialSolution&&!(test.skill==='listening'&&scored))||isPreview||reviewLoaded)return;let alive=true;setSolutionError('');
    void assessmentRequest('/api/test-review',{testId:test.sourceTestId||test.id,sectionIds:test.sectionIds,sourceSections:test.sourceSections,mode:'practice'}).then(data=>{if(!alive)return;setReviewKeys(data.keys||{});setTranscripts(data.transcripts||{});setReviewLoaded(true);setScored(true);setTimerRunning(false);setShowAnswers(true);setShowExplanations(true);}).catch(e=>{if(alive)setSolutionError(e.message);});return ()=>{alive=false;};
  },[initialSolution,test.id,solutionRetry,scored,reviewLoaded,isPreview]);
  const allQuestions = test.parts.flatMap((p) => p.questions);
  const allQuestionNumbers = allQuestions
    .map((q) => q.number)
    .sort((a, b) => a - b);
  const currentPartNumbers = part.questions.map((q) => q.number);

  // Save the exact session for refresh/recovery, including completed exams.
  useEffect(() => {
    if(initialSolution)return;
    const persist = () => {
      try {
        localStorage.setItem(
          sessionKey,
          JSON.stringify({
            responses,
            flags,
            notes,
            highlights,
            remaining: timerRemaining,
            elapsedSeconds,startedAt,
            scored,
            result: scoreResult,
            band: approxBand,
          }),
        );
      } catch {
        onNotify(
          "Your browser could not save this session. Keep the tab open or free up browser storage.",
        );
      }
    };
    persist();
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
    };
  }, [
    sessionKey,
    initialSolution,
    responses,
    flags,
    notes,
    highlights,
    timerRemaining,elapsedSeconds,startedAt,
    scored,
    scoreResult,
    approxBand,
    onNotify,
  ]);

  useEffect(()=>{
    if(scored||initialSolution||!audioReady)return;
    if(initialDurationMinutes>0&&!timerRunning&&!expired.current)return;
    let previous=Date.now();
    const tick=setInterval(()=>{const now=Date.now();setElapsedSeconds(s=>s+(now-previous)/1000);previous=now},1000);
    return()=>clearInterval(tick);
  },[scored,initialSolution,timerRunning,initialDurationMinutes,audioReady]);
  // Timer updaters are pure; expiry submission happens once in an effect.
  const submitLatest = useRef<() => Promise<void>>(async () => {});
  const expired = useRef(false);
  useEffect(() => {
    if (!timerRunning || !audioReady) return;
    const initial=timerRemaining,began=Date.now();
    const interval = setInterval(
      () => setTimerRemaining(Math.max(0,initial-Math.floor((Date.now()-began)/1000))),
      1000,
    );
    return () => clearInterval(interval);
  }, [timerRunning,startedAt,audioReady]);
  useEffect(() => {
    if (!audioReady || !timerRunning || timerRemaining > 0 || expired.current) return;
    expired.current = true;
    setTimerRunning(false);
    if (mode === "exam" && !scored) void submitLatest.current();
    else if(!scored){setAudioStop(n=>n+1);setTimeUp(true);}
  }, [timerRemaining, timerRunning, mode, scored, onNotify,audioReady]);

  // Handle Response Changes
  const handleInputChange = (questionNumber: number, value: string) => {
    if (submitting || scored) return;
    setResponses((prev) => ({
      ...prev,
      [questionNumber]: value,
    }));
  };

  const handleMultiChoiceChange = (
    groupNumbers: number[],
    value: string,
    isChecked: boolean,
  ) => {
    if (submitting || scored) return;
    const selected = groupNumbers.map((n) => responses[n]).filter(Boolean);
    if (
      isChecked &&
      !selected.includes(value) &&
      selected.length >= groupNumbers.length
    ) {
      onNotify(`Please choose at most ${groupNumbers.length} options.`);
      return;
    }
    setResponses((prev) => {
      const currentValues = groupNumbers.map((n) => prev[n]).filter(Boolean);
      let nextValues = [...currentValues];
      if (isChecked) {
        if (nextValues.length >= groupNumbers.length) {
          return prev;
        }
        if (!nextValues.includes(value)) nextValues.push(value);
      } else {
        nextValues = nextValues.filter((v) => v !== value);
      }

      const updated = { ...prev };
      groupNumbers.forEach((n, idx) => {
        updated[n] = nextValues[idx] || "";
      });
      return updated;
    });
  };

  // Jump to specific question
  const handleJump = (qNum: number) => {
    const partIdx = test.parts.findIndex((p) =>
      p.questions.some((q) => q.number === qNum),
    );
    if (partIdx >= 0 && partIdx !== currentPartIndex) {
      setCurrentPartIndex(partIdx);
    }

    setTimeout(() => {
      const el = Array.from(
        document.querySelectorAll<HTMLElement>("[data-q-anchor]"),
      ).find((e) => e.dataset.qAnchor?.split(",").includes(String(qNum)));
      if (el) {
        setMobileTab(
          passageRef.current?.contains(el) ? "passage" : "questions",
        );
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("q-focus");
        setTimeout(() => el.classList.remove("q-focus"), 2500);
        const input = el.querySelector("input, select") as HTMLElement;
        if (input) input.focus({ preventScroll: true });
      }
    }, 100);
  };

  // Flag toggle
  const toggleFlag = (qNum: number) => {
    setFlags((prev) =>
      prev.includes(qNum) ? prev.filter((n) => n !== qNum) : [...prev, qNum],
    );
    onNotify(
      `Question ${qNum} ${flags.includes(qNum) ? "unflagged" : "flagged"}.`,
    );
  };

  // Locate quote in passage
  const handleLocateQuote = (quote: string) => {
    if (!passageRef.current || !quote) return;
    const root = passageRef.current;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    const fullText = nodes.map((n) => n.data).join("");
    const pos = fullText.toLowerCase().indexOf(quote.toLowerCase());

    if (pos < 0) {
      onNotify("Reference quote not found in this passage.");
      return;
    }

    let accumulated = 0;
    for (const node of nodes) {
      if (pos < accumulated + node.length) {
        node.parentElement?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        node.parentElement?.classList.add("q-focus");
        setTimeout(() => node.parentElement?.classList.remove("q-focus"), 3000);
        break;
      }
      accumulated += node.length;
    }
  };

  function submissionPayload() {
    return {
      testId: test.sourceTestId || test.id,
      responses,
      mode,
      sectionIds: test.sectionIds,
      sourceSections: test.sourceSections,
      testTitle: test.title,
    };
  }
  // Both modes use server keys or local deterministic scoring, saving progress to local storage.
  const handleSubmit = async (manual = true) => {
    if (scored) {
      setShowResultsModal(true);
      return;
    }
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);
    setAudioStop(n=>n+1);
    const wasRunning = timerRunning;
    const submissionOwner = auth.currentUser?.uid || "guest";
    setTimerRunning(false);
    try {
      if(onStageComplete){await onStageComplete({responses,elapsedSeconds:Math.round(elapsedSeconds),startedAt,completedAt:Date.now()});return;}
      const attemptId = createId();
      // Unsaved editor previews use their own local keys and never create an attempt.
      if (isPreview) {
        const result = scoreTest(
          test.parts.map((p) => ({
            numbers: p.questions.map((q) => q.number),
            keys: Object.fromEntries(p.questions.map((q) => [q.number, q])),
            missing: p.questions.filter((q) => q.missing).map((q) => q.number),
            multiGroups: Object.values(p.slots)
              .filter((s) => s.type === "multi")
              .map((s) => s.numbers),
          })),
          responses,
        );
        setScoreResult(result);
        setApproxBand(estimatedBand(result,test.skill));
        setScored(true);
        if(test.skill==='listening')setListeningReview(true);
        setShowResultsModal(true);
        return;
      }
      const data = await assessmentRequest("/api/submit-exam", {
        ...submissionPayload(),
        attemptId,
      });
      setReviewKeys(data.keys || {});
      setTranscripts(data.transcripts||{});
      setReviewLoaded(true);
      setScoreResult(data.result);
      setApproxBand(data.band);
      setScored(true);
      setShowResultsModal(true);
      if(test.skill==='listening')setListeningReview(true);
      setShowAnswers(true);
      setShowExplanations(true);

      if (submissionOwner === "guest") {
        setHistoryNotice("Sign in to save your test results. Your answers and explanations are available to review.");
        return;
      }
      setHistoryNotice("");
      const attemptRecord: AttemptRecord = {
        id: data.attemptId || attemptId,
        owner: submissionOwner,
        testId: test.sourceTestId || test.id,
        testTitle: test.title,
        skill: test.skill,
        mode,
        createdAt: Date.now(),
        startedAt,completedAt:Date.now(),elapsedSeconds:Math.round(elapsedSeconds),
        responses,
        result: data.result,
        band: data.band,
        ...(test.sectionIds ? { sectionIds: test.sectionIds } : {}),
        ...(test.sourceSections ? { sourceSections: test.sourceSections } : {}),
      };
      pendingAttempt.current = attemptRecord;
      try {
        saveAttempt(localStorage, submissionOwner, attemptRecord);
        setHistoryError("");
        pendingAttempt.current = null;
        if ((auth.currentUser?.uid || "guest") === submissionOwner) {
          onHistorySaved();
          window.dispatchEvent(new Event("study-history-change"));
        }
      } catch {
        setHistoryError(
          "Your score is ready, but browser storage is full or blocked. Retry saving or download your result before leaving.",
        );
      }
    } catch (error) {
      if (wasRunning && timerRemaining > 0) setTimerRunning(true);
      onNotify(
        error instanceof Error
          ? error.message
          : "Could not score this test. Please retry.",
      );
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  };
  submitLatest.current = () => handleSubmit(false);

  const ensureReviewKeys = async () => {
    if (!scored) return false;
    if (isPreview || reviewLoaded) return true;
    try {
      const data = await assessmentRequest("/api/test-review", {
        ...submissionPayload(),
        mode: "practice",
      });
      setReviewKeys(data.keys || {});
      setTranscripts(data.transcripts||{});
      setReviewLoaded(true);
      return true;
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not load solutions.");
      return false;
    }
  };
  const toggleReview = async (kind: "answers" | "explanations") => {
    if (!scored) return;
    const shown = kind === "answers" ? showAnswers : showExplanations;
    if (!shown && !(await ensureReviewKeys())) return;
    if (kind === "answers") setShowAnswers(!shown);
    else setShowExplanations(!shown);
  };
  const renderSlot = (id: string) => {
    const slot = part.slots[id];
    return slot ? (
      <> <AnswerControl
        slot={slot}
        part={part}
        responses={responses}
        showAnswers={false}
        disabled={initialSolution || submitting || scored}
        onChange={handleInputChange}
        onMultiChange={handleMultiChoiceChange}
      />{!initialSolution&&!scored&&<span className="inline-question-flags">{slot.numbers.map(n=><button key={n} className={`question-flag ${flags.includes(n)?'is-flagged':''}`} aria-label={`${flags.includes(n)?'Unflag':'Flag'} question ${n}`} title={`${flags.includes(n)?'Unflag':'Flag'} question ${n}`} aria-pressed={flags.includes(n)} onClick={()=>toggleFlag(n)}><Flag size={15} fill={flags.includes(n)?'currentColor':'none'}/></button>)}</span>}{scored&&(showAnswers||showExplanations)&&slot.numbers.map(n=>{const q=part.questions.find(q=>q.number===n);if(!q)return null;const row=scoreResult?.rows.find(r=>r.number===n);return <span className="slot-solution" key={n}>{showAnswers&&<span className="solution-answer"><strong>Answer {n}:</strong> {q.answer?.split('||').join(' / ')||'Not provided'} {row&&<small data-score={row.status}>{row.status==='correct'?'Correct':row.response?'Your answer: '+row.response:'Unanswered'}</small>}</span>}{q.referenceQuote&&<button className="quiet-button" onClick={()=>handleLocateQuote(q.referenceQuote!)}>Locate in passage</button>}{showExplanations&&q.explanationHtml&&<details className="explanation-card" open><summary>Explanation · Question {n}</summary><span><strong>Correct answer:</strong> {q.answer?.split('||').join(' / ')}</span>{q.referenceQuote&&<blockquote>{q.referenceQuote}</blockquote>}<span dangerouslySetInnerHTML={{__html:cleanLayout(q.explanationHtml)}}/></details>}</span>;})}</>
    ) : (
      <span role="alert">Question slot missing. Please report this test.</span>
    );
  };
  const isLegacyBroken =
    part.questions.some((q) => !q.missing) &&
    Object.keys(part.slots || {}).length === 0;
  const orphanSlots = Object.values<TestSlot>(part.slots || {}).filter(
    (slot) =>
      ![part.passageHtml, part.questionHtml].some(
        (html) =>
          html.includes(`data-slot="${slot.id}"`) ||
          html.includes(`data-slot='${slot.id}'`),
      ),
  );

  // Text selection handler for floating tools
  const handleMouseUp = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) {
      setSelectionBox(null);
      return;
    }
    const range = s.getRangeAt(0);
    const rawText=s.toString();
    const text = rawText.trim();
    if (text.length < 2 || text.length > 500) {
      setSelectionBox(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const commonAncestor = range.commonAncestorContainer.parentElement;
    const isPassage = Boolean(
      passageRef.current && passageRef.current.contains(commonAncestor),
    );
    const isQuestions = Boolean(
      questionsRef.current && questionsRef.current.contains(commonAncestor),
    );

    if (!isPassage && !isQuestions) {
      setSelectionBox(null);
      return;
    }

    const context = commonAncestor?.textContent?.slice(0, 300) || text;

    setSelectionBox({
      ...(()=>{const offsets=selectionOffsets(isPassage?passageRef.current!:questionsRef.current!,range);const start=offsets.start+rawText.indexOf(text);return {start,end:start+text.length};})(),
      text,
      context,
      pane: isPassage ? "passage" : "questions",
      x: Math.max(10, Math.min(window.innerWidth - 260, rect.left)),
      y: Math.max(10, rect.top - 46),
    });
  };

  // Selection actions
  const handleSelectionHighlight = () => {
    if (!selectionBox) return;
    setHighlights((prev) => [
      ...prev,
      {
        id: `hl_${Date.now()}`,
        start:selectionBox.start,end:selectionBox.end,
        text: selectionBox.text,
        context: selectionBox.context,
        pane: selectionBox.pane,
        part: currentPartIndex,
      },
    ]);
    setSelectionBox(null);
    onNotify("Text highlighted.");
  };

  const handleSelectionNote = () => {
    if (!selectionBox) return;
    setActiveDrawer("notes");
    setNewNoteText(`Note on: "${selectionBox.text}"\n`);
    setSelectionBox(null);
  };

  const openSelectionDictionary=(saveIntent:boolean)=>{
    if(!selectionBox)return;
    if(mode==='exam'&&!scored){onNotify('Dictionary is disabled during an active exam.');return;}
    if(saveIntent&&!auth.currentUser){onNotify('Sign in to save vocabulary.');setSelectionBox(null);return;}
    setDictionaryContext(selectionBox.context);setDictionarySaveIntent(saveIntent);setDictionaryWord(selectionBox.text);setSelectionBox(null);
  };
  const savingWord=useRef(false);
  const handleSelectionWord=async()=>{
    if(!selectionBox||savingWord.current)return;
    if(mode==='exam'&&!scored){onNotify('Dictionary is disabled during an active exam.');return;}
    if(!auth.currentUser){onNotify('Sign in to save vocabulary.');setSelectionBox(null);return;}
    const selected=selectionBox,owner=auth.currentUser.uid;
    savingWord.current=true;setSelectionBox(null);onNotify('Looking up “'+selected.text+'”…');
    try {
      const item=await lookupVocabulary(selected.text,selected.context);
      if(auth.currentUser?.uid!==owner)return;
      await onSaveVocabulary(item);
    }catch(error){onNotify(error instanceof Error?error.message:'Could not save this word. Please retry.');}
    finally{savingWord.current=false;}
  };
  const handleSelectionDictionary=()=>openSelectionDictionary(false);

  // Content Report submission
  const handleSendReport = async () => {
    if (!reportMessage.trim()) {
      onNotify("Please enter a description of the issue.");
      return;
    }
    try {
      await requestJson("/api/content-report", {
        id: `rep_${Date.now()}`,
        owner: profile.id,
        testId: test.sourceTestId || test.id,
        testTitle: test.title,
        question: reportQuestion,
        category: reportCategory,
        message: reportMessage.trim(),
        status: "open",
        createdAt: Date.now(),
      },()=>auth.currentUser);
      setShowReportModal(false);
      setReportMessage("");
      onNotify("Content issue reported for admin review.");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err));
    }
  };

  const hasCountdown=initialDurationMinutes>0&&!(mode==='practice'&&expired.current&&timerRemaining===0&&!timeUp);
  const minutes = Math.floor(timerRemaining / 60);
  const seconds = timerRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const answeredCount = allQuestionNumbers.filter((n) =>
    Boolean(responses[n]?.trim()),
  ).length;

  return (
    <div
      className={`app ${test.skill==='listening'?'listening-workspace':''} ${mode === "exam" ? "exam-mode" : ""} ${scored ? "exam-finished" : ""}`}
      style={{ "--study-font-size": `${textSize}px` } as React.CSSProperties}
      onMouseUp={handleMouseUp}
      onTouchEnd={()=>setTimeout(handleMouseUp,100)}
    >
      {timeUp&&<ConfirmActionDialog title="Practice time is up" confirmLabel="Submit now" cancelLabel="Keep practising" onCancel={()=>setTimeUp(false)} onConfirm={()=>{setTimeUp(false);void handleSubmit()}}>Submit your answers now, or continue practising without a time limit.</ConfirmActionDialog>}
      {confirmSubmit && <ConfirmActionDialog title={stageLabel||"Submit your test?"} confirmLabel={false ? "Xác nhận nộp bài" : "Confirm submission"} onCancel={() => setConfirmSubmit(false)} onConfirm={() => {setConfirmSubmit(false);void handleSubmit();}}>
        {false ? `Mình đã trả lời ${answeredCount}/${allQuestionNumbers.length} câu. Sau khi nộp, câu trả lời sẽ được khóa và bài sẽ được chấm điểm.` : `You have answered ${answeredCount}/${allQuestionNumbers.length} questions. Submitting locks your answers and grades the test.`}
      </ConfirmActionDialog>}
      {resetAction && (
        <ConfirmActionDialog
          title={
            resetAction === "restart"
              ? "Restart this test?"
              : "Reset responses?"
          }
          confirmLabel={
            resetAction === "restart" ? "Restart test" : "Reset responses"
          }
          onCancel={() => setResetAction(null)}
          onConfirm={() => {
            setAudioStop(n=>n+1);setElapsedSeconds(0);setStartedAt(Date.now());
            setResponses({});
            setFlags([]);
            setScored(false);
            setScoreResult(null);
            setApproxBand(null);
            setShowResultsModal(false);
            setShowAnswers(false);
            setShowExplanations(false);
            setReviewLoaded(false);
            setReviewKeys({});
            setListeningReview(false);setTranscripts(isPreview?Object.fromEntries(test.parts.map(p=>[p.id,p.passageHtml])):{});
            if (resetAction === "restart") {
              setTimerRemaining(Math.max(0, initialDurationMinutes) * 60);
              setTimerRunning(mode === "exam" || initialDurationMinutes > 0);
              expired.current = false;
            }
            setResetAction(null);
            setShowDisplayModal(false);
            onNotify("Responses cleared.");
          }}
        >
          Your current responses will be cleared. Completed history records are
          kept.
        </ConfirmActionDialog>
      )}
      <main className="main">
        {/* Top Header Bar */}
        <header className="topbar reader-toolbar">
          <button className="reader-back" title="Return to tests" onClick={onReturnToLibrary}><ArrowLeft size={17}/>Back</button>
          <div className="reader-test-heading"><small>{test.skill.toUpperCase()} · {initialSolution?'SOLUTION':scored?'REVIEW':mode==='exam'?'EXAM MODE':'PRACTICE MODE'}</small><strong title={test.title}>{test.title}</strong></div>
          <div className="reader-actions" role="toolbar" aria-label="Test tools">
            <div className={`reader-clock ${hasCountdown&&timerRemaining<300?'low':''}`} aria-label={hasCountdown?`Time remaining ${timeFormatted}`:'Unlimited practice'}><AlarmClock size={23}/>{hasCountdown?<span>{timeFormatted}</span>:<InfinityIcon size={24}/>}<span className="sr-only">{hasCountdown?'remaining':'Unlimited time'}</span>{mode==='practice'&&hasCountdown&&!scored&&!initialSolution&&<button aria-label={timerRunning?'Pause timer':'Resume timer'} title={timerRunning?'Pause timer':'Resume timer'} onClick={()=>setTimerRunning(!timerRunning)}>{timerRunning?<Pause size={15}/>:<Play size={15}/>}</button>}</div>
            <ShareButton compact path={introductionLink(test)} title={test.title}/>
            <button className="reader-icon" title="Print or download" aria-label="Print or download" disabled={mode==='exam'&&!scored&&!initialSolution} onClick={()=>setShowExport(true)}><Printer size={22}/></button>
            <button className="reader-icon" title="Report an issue" aria-label="Report an issue" onClick={()=>{setReportQuestion(currentPartNumbers[0]||1);setShowReportModal(true);}}><Bug size={22}/></button>
            <button className="reader-icon" title="Dictionary" aria-label="Dictionary" disabled={mode==='exam'&&!scored} onClick={()=>{setDictionaryContext('');setDictionarySaveIntent(false);setDictionaryWord('');}}><BookOpen size={22}/></button>
            <button className="reader-icon" title="Display settings" aria-label="Display settings" onClick={()=>setShowDisplayModal(true)}><Settings2 size={22}/></button>
            <button className="reader-icon" title="Notes and highlights" aria-label="Notes and highlights" aria-pressed={activeDrawer==='notes'} onClick={()=>setActiveDrawer(activeDrawer==='notes'?null:'notes')}><NotebookPen size={22}/></button>
          </div>
        </header>
        <nav className="reader-passage-tabs" aria-label="Test parts">
          {test.parts.map((item,index)=><button key={item.id} type="button" className={currentPartIndex===index?'active':''} aria-pressed={currentPartIndex===index} title={passageTitle(item.passageHtml,item.title,index)} onClick={()=>setCurrentPartIndex(index)}>{test.skill==='reading'?'Passage':'Part'} {item.position||index+1}</button>)}
        </nav>
        {initialSolution&&!reviewLoaded&&!solutionError&&<p className="studio-callout" role="status">Loading solution guide…</p>}
        {solutionError&&<div className="studio-callout" role="alert">{solutionError}<button className="quiet-button" onClick={()=>setSolutionRetry(i=>i+1)}>Retry solutions</button></div>}
        {historyError && (
          <div className="history-save-error" role="alert">
            <strong>{historyError}</strong>
            <button
              className="studio-secondary"
              onClick={() => {
                const attempt = pendingAttempt.current;
                if (!attempt) return;
                try {
                  saveAttempt(localStorage, attempt.owner, attempt);
                  setHistoryError("");
                  pendingAttempt.current = null;
                  if ((auth.currentUser?.uid || "guest") === attempt.owner) {
                    onHistorySaved();
                    window.dispatchEvent(new Event("study-history-change"));
                  }
                } catch {
                  onNotify(
                    "Storage is still unavailable. Download your result to keep a copy.",
                  );
                }
              }}
            >
              Retry saving
            </button>
            <button
              className="studio-secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(pendingAttempt.current, null, 2)], {
                    type: "application/json",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "ielts-result.json";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
              }}
            >
              Download result
            </button>
          </div>
        )}
        {audioProgress}
        {test.skill==='listening'&&<ListeningAudio key={sessionId} parts={test.parts} sources={audioSources} stopSignal={audioStop} disabled={submitting||!audioReady} volume={volume} speedIndex={audioSpeed} onSpeedChange={setAudioSpeed} bufferedOnly exam={mode==='exam'&&!scored&&!initialSolution}/>}

        {scored&&<section className="solution-score-banner"><div><small>{initialSolution&&!scoreResult?'SOLUTION GUIDE':'TEST COMPLETE'}</small><strong>{scoreResult?scoreResult.correct+' / '+scoreResult.gradable+' correct':'Answers and explanations'}</strong>{approxBand!==null&&<span>IELTS {test.skill==='listening'?'Listening':'Reading'} · Estimated band {approxBand.toFixed(1)}</span>}</div><div className="studio-actions"><button className="quiet-button" aria-pressed={showAnswers} onClick={()=>void toggleReview('answers')}>Answers {showAnswers?'on':'off'}</button><button className="quiet-button" aria-pressed={showExplanations} onClick={()=>void toggleReview('explanations')}>Explanations {showExplanations?'on':'off'}</button><button className="studio-secondary" onClick={()=>setShowAnswerSheet(true)}>Answer sheet</button></div></section>}

        {/* Mobile Tab Toggle for narrow viewports */}
        {(test.skill==='reading'||listeningSolution)&&<div className="mobile-tabs">
          <button
            className={`mobile-tab ${mobileTab === "passage" ? "active" : ""}`}
            onClick={() => setMobileTab("passage")}
          >
            {test.skill==='listening'?'Transcript':'Passage'}
          </button>
          <button
            className={`mobile-tab ${mobileTab === "questions" ? "active" : ""}`}
            onClick={() => setMobileTab("questions")}
          >
            Questions
          </button>
        </div>}

        {/* Split-Screen Main Content */}
        <div
          ref={splitRef}
          style={{"--passage-width":paneWidth+"%"} as React.CSSProperties}
          className={`split-view ${test.skill==='listening'&&!listeningSolution?'listening-questions-only':''} ${showAnswers ? "show-answers" : ""} ${showExplanations ? "show-explanations" : ""}`}
        >
          {/* Left Pane: Passage Content */}
          {(test.skill==='reading'||listeningSolution)&&<article
            ref={passageRef}
            className={`pane passage-pane ${mobileTab === "questions" ? "mobile-hidden" : ""}`}
          >
            <div className="pane-label">
              {test.skill==='listening'?'Part '+(part.position||currentPartIndex+1)+' · Transcript':passageTitle(part.passageHtml, part.title, currentPartIndex)}
            </div>

            <div className="reading-content">
              {test.skill==='listening'?<><h3>Transcript</h3>{transcripts[part.id]?<QuestionLayout html={cleanLayout(transcripts[part.id])} renderSlot={renderSlot}/>:<p className="studio-callout">{reviewLoaded||isPreview?'No transcript was provided for this part.':'Loading transcript…'}</p>}</>:<QuestionLayout html={normalizePassageHeadings(part.passageHtml)} renderSlot={renderSlot} />}
            </div>
          </article>}

          {(test.skill==='reading'||listeningSolution)&&<div className="pane-resizer" role="separator" aria-label="Resize reading passage" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={paneWidth} tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowLeft'){e.preventDefault();setPaneWidth(w=>Math.max(25,w-2));}if(e.key==='ArrowRight'){e.preventDefault();setPaneWidth(w=>Math.min(75,w+2));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId)||!splitRef.current)return;const r=splitRef.current.getBoundingClientRect();setPaneWidth(Math.max(25,Math.min(75,(e.clientX-r.left)/r.width*100)));}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}><span/></div>}
          {/* Right Pane: Questions Content */}
          <section
            ref={questionsRef}
            className={`pane questions-pane ${mobileTab === "passage" && (test.skill==='reading'||listeningSolution) ? "mobile-hidden" : ""}`}
          >
            <div className="pane-label">
              Questions {currentPartNumbers[0] || 1}–
              {currentPartNumbers[currentPartNumbers.length - 1] ||
                currentPartNumbers[0] ||
                1}
            </div>

            {/* Render Questions */}
            <div className="questions-content">
              {isLegacyBroken ? (
                <p role="alert" className="studio-callout">
                  This test was imported without answer controls. An
                  administrator must re-upload its original ZIP or HTML file to
                  repair it.
                </p>
              ) : (
                <QuestionLayout
                  html={test.skill==='listening'?part.questionHtml.replace(/(>\s*)section(\s+[1-4]\s*<)/gi,'$1Part$2'):part.questionHtml}
                  renderSlot={renderSlot}
                />
              )}
              {orphanSlots.map((slot) => (
                <div key={slot.id}>{renderSlot(slot.id)}</div>
              ))}


            </div>
          </section>
        </div>

        <footer className="bottom-bar compact-reader-footer">
          <span className="reader-progress" aria-live="polite">{flagMode?'Click numbers to flag':`${answeredCount}/${allQuestionNumbers.length} answered`}</span>
          {!initialSolution&&!scored&&<button className={`reader-icon flag-mode-button ${flagMode?'is-active':''}`} aria-label="Flag questions" title={flagMode?'Leave flag mode':'Flag questions'} aria-pressed={flagMode} onClick={()=>setFlagMode(value=>!value)}><Flag size={17}/>{flags.length>0&&<span>{flags.length}</span>}</button>}
          <nav className="question-nav" aria-label="Question navigation">{allQuestionNumbers.map(qNum=>{
            const isFlagged=flags.includes(qNum),scoreStatus=scoreResult?.rows.find(row=>row.number===qNum)?.status;
            return <button key={qNum} className={`question-chip ${currentPartNumbers.includes(qNum)?'current-part':''} ${responses[qNum]?.trim()?'answered':''} ${isFlagged?'flagged':''}`} data-score={scoreStatus} aria-label={`Question ${qNum}${isFlagged?', flagged':''}`} aria-pressed={flagMode?isFlagged:undefined} onClick={()=>flagMode?toggleFlag(qNum):handleJump(qNum)} title={flagMode?`${isFlagged?'Unflag':'Flag'} question ${qNum}`:`Question ${qNum}${isFlagged?' · Flagged':''}`}>
              {qNum}{isFlagged&&<Flag className="chip-flag" size={9} fill="currentColor"/>}
            </button>;
          })}</nav>
          <div className="reader-footer-actions"><button className="quiet-button answer-sheet-trigger" onClick={()=>setShowAnswerSheet(true)}>Answer sheet</button><button className="quiet-button reader-reset" aria-label={scored?'Retake test':'Reset responses'} title={scored?'Retake test':'Reset responses'} disabled={submitting} onClick={()=>{if(initialSolution&&onRetake){onRetake();return;}setResetAction(scored?'restart':'reset');}}><RotateCcw size={16}/></button><button className="studio-primary" disabled={submitting||isLegacyBroken||(initialSolution&&!reviewLoaded)} onClick={()=>scored?scoreResult?setShowResultsModal(true):setShowAnswerSheet(true):setConfirmSubmit(true)}>{scored?scoreResult?'Review score':'Answer sheet':onStageComplete?(test.skill==='listening'?'Continue to Reading':'Finish full test'):'Submit test'}</button></div>
        </footer>
      </main>

      {dictionaryWord!==null&&<DictionaryPanel initialWord={dictionaryWord} sourceContext={dictionaryContext} saveIntent={dictionarySaveIntent} onClose={()=>setDictionaryWord(null)} onSave={onSaveVocabulary}/>}
      {showExport&&<ExportDialog test={test} onClose={()=>setShowExport(false)} loadTranscripts={async()=>{if(isPreview)return Object.fromEntries(test.parts.map(p=>[p.id,p.passageHtml]));if(Object.keys(transcripts).length)return transcripts;const data=await assessmentRequest('/api/test-review',{...submissionPayload(),mode:'practice'});setTranscripts(data.transcripts||{});return data.transcripts||{};}} loadKeys={async()=>{if(isPreview)return Object.fromEntries(test.parts.flatMap(p=>p.questions.map(q=>[q.number,q])));const data=await assessmentRequest('/api/test-review',{...submissionPayload(),mode:'practice'});return data.keys||{};}}/>}
      {/* Floating Selection Tools */}
      {selectionBox && (
        <div
          className="selection-tools"
          onPointerDown={e=>e.preventDefault()}
          onMouseUp={e=>e.stopPropagation()}
          style={{ left: `${selectionBox.x}px`, top: `${selectionBox.y}px` }}
        >
          <button onClick={handleSelectionHighlight}>Highlight</button>
          <button onClick={handleSelectionNote}>Note</button>
          <button onClick={handleSelectionWord}>Save word</button>
          <button onClick={handleSelectionDictionary}>Dictionary</button>
        </div>
      )}

      {/* Study Drawer (Notes / Question Review) */}
      {activeDrawer && (
        <aside className="study-drawer">
          <div className="studio-modal-heading">
            <h2>
              {activeDrawer === "notes"
                ? "Notes & Highlights"
                : "Question Review"}
            </h2>
            <button
              className="studio-quiet"
              onClick={() => setActiveDrawer(null)}
            >
              ✕
            </button>
          </div>

          {activeDrawer === "notes" && (
            <div>
              <label className="studio-field">
                New Note
                <textarea
                  rows={3}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Record key learning or observation…"
                />
              </label>

              <button
                className="studio-primary"
                style={{ width: "100%", marginBottom: "16px" }}
                onClick={() => {
                  if (!newNoteText.trim()) return;
                  setNotes((prev) => [
                    ...prev,
                    {
                      id: `note_${Date.now()}`,
                      text: newNoteText.trim(),
                      part: currentPartIndex,
                      createdAt: Date.now(),
                    },
                  ]);
                  setNewNoteText("");
                  onNotify("Note saved.");
                }}
              >
                Add Note
              </button>

              <div className="saved-highlights"><h3>Highlights</h3>{highlights.length===0&&<p>Select passage text, then choose Highlight.</p>}{highlights.map(h=><article key={h.id}><mark>{h.text}</mark><button className="quiet-button" onClick={()=>setHighlights(items=>items.filter(item=>item.id!==h.id))}>Remove</button></article>)}</div><div style={{ display: "grid", gap: "10px" }}>
                {notes.map((n) => (
                  <article key={n.id} className="study-note">
                    {n.quote && <blockquote>"{n.quote}"</blockquote>}
                    <div>{n.text}</div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: "8px",
                      }}
                    >
                      <span className="studio-small">{test.skill==='listening'?'Part':'Passage'} {n.part + 1}</span>
                      <button
                        className="studio-quiet studio-danger"
                        style={{ padding: "2px 6px", fontSize: "10px" }}
                        onClick={() =>
                          setNotes((prev) => prev.filter((x) => x.id !== n.id))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeDrawer === "review" && (
            <div>
              <div className="studio-chips">
                {(["all", "unanswered", "flagged"] as const).map((filter) => (
                  <button
                    key={filter}
                    className={`studio-chip ${drawerReviewFilter === filter ? "active" : ""}`}
                    onClick={() => setDrawerReviewFilter(filter)}
                  >
                    {filter.toUpperCase()}
                  </button>
                ))}
              </div>

              <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
                {allQuestionNumbers
                  .filter((n) => {
                    if (drawerReviewFilter === "unanswered")
                      return !responses[n]?.trim();
                    if (drawerReviewFilter === "flagged")
                      return flags.includes(n);
                    return true;
                  })
                  .map((n) => (
                    <div
                      key={n}
                      style={{
                        padding: "10px",
                        border: "1px solid var(--studio-border)",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong>Question {n}</strong>{scored&&<p><b>Correct answer:</b> {reviewKeys[n]?.answer?.split('||').join(' / ')||scoreResult?.rows.find(r=>r.number===n)?.answer||'Not provided'}</p>}
                        <div className="studio-small">
                          {responses[n]
                            ? `Answer: ${responses[n]}`
                            : "Unanswered"}
                          {flags.includes(n) ? " · Flagged" : ""}
                        </div>
                      </div>
                      <button
                        className="studio-quiet"
                        onClick={() => {
                          setActiveDrawer(null);
                          handleJump(n);
                        }}
                      >
                        Jump →
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </aside>
      )}

      {showAnswerSheet&&<AnswerSheet parts={test.parts} skill={test.skill} responses={responses} flags={flags} result={scoreResult} keys={scored||initialSolution?reviewKeys:{}} onClose={()=>setShowAnswerSheet(false)} onJump={number=>{setShowAnswerSheet(false);handleJump(number)}}/>}
      {showResultsModal&&scoreResult&&<ResultScreen test={test} result={scoreResult} band={approxBand} elapsedSeconds={Math.round(elapsedSeconds)} mode={mode} notice={historyNotice||historyError} onLeave={onReturnToLibrary} onReview={()=>{void ensureReviewKeys().then(ok=>{if(ok){setShowResultsModal(false);setShowAnswers(true);setShowExplanations(true);if(test.skill==='listening')setListeningReview(true)}})}}/>}

      {/* Content Report Dialog */}
      {showReportModal && (
        <dialog
          className="studio-modal"
          open
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 130,
          }}
        >
          <div className="studio-modal-heading">
            <h2>Report a Content Issue</h2>
            <button
              className="studio-quiet"
              onClick={() => setShowReportModal(false)}
            >
              ✕
            </button>
          </div>

          <label className="studio-field">
            Question Number
            <Select
              value={reportQuestion}
              onChange={(e) => setReportQuestion(Number(e.target.value))}
            >
              {allQuestionNumbers.map((n) => (
                <option key={n} value={n}>
                  Question {n}
                </option>
              ))}
            </Select>
          </label>

          <label className="studio-field">
            Issue Category
            <Select
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
            >
              <option value="typo">Wording / Typo in Question</option>
              <option value="answer">Answer Key Discrepancy</option>
              <option value="explanation">Explanation Error</option>
              <option value="missing">Missing Content</option>
              <option value="other">Other</option>
            </Select>
          </label>

          <label className="studio-field">
            Description of the problem
            <textarea
              rows={4}
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
              placeholder="Explain what is inaccurate or needs correction…"
            />
          </label>

          <div className="studio-actions" style={{ marginTop: "16px" }}>
            <button className="studio-primary" onClick={handleSendReport}>
              Submit Report
            </button>
            <button
              className="studio-secondary"
              onClick={() => setShowReportModal(false)}
            >
              Cancel
            </button>
          </div>
        </dialog>
      )}

      {showDisplayModal&&<Modal className="reading-display-dialog" label="Test settings" onClose={()=>setShowDisplayModal(false)}><div className="studio-modal-heading"><h2>Test settings</h2><button className="quiet-button" aria-label="Close display settings" onClick={()=>setShowDisplayModal(false)}>×</button></div>{test.skill==='listening'&&<div className="listening-settings"><label>Volume <output>{Math.round(volume*100)}%</output><input aria-label="Listening volume" type="range" min={0} max={1} step={.01} value={volume} onInput={e=>setVolume(Number(e.currentTarget.value))} onChange={e=>setVolume(Number(e.target.value))}/></label><label>Playback speed <output>{playbackSpeeds[audioSpeed]}×</output><input aria-label="Listening speed" type="range" min={0} max={9} step={1} value={audioSpeed} disabled={mode==='exam'&&!scored&&!initialSolution} onInput={e=>setAudioSpeed(Number(e.currentTarget.value))} onChange={e=>setAudioSpeed(Number(e.target.value))}/></label></div>}<FontSizeSlider value={textSize} onChange={setTextSize}/><p className="font-size-preview" style={{fontSize:textSize}}>Make reading feel comfortable.</p><div className="studio-actions"><button className="studio-primary" onClick={()=>setShowDisplayModal(false)}>Done</button></div></Modal>}

    </div>
  );
};

