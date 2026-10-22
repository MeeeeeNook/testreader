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

export const TestWorkspace: React.FC<TestWorkspaceProps> = ({
  test,
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
  const [resetAction, setResetAction] = useState<"reset" | "restart" | null>(
    null,
  );
  const [textSize, setTextSize] = useState(
    Math.max(18, profile.fontSize || 18),
  );
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const sessionKey = `reading-room:v3:${profile.id}:${sessionId}:${mode}${isPreview ? ":preview" : ""}`;
  const [savedSession] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(sessionKey) || "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved)
        ? saved
        : {};
    } catch {
      return {};
    }
  });
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
    !savedSession.scored && (mode === "exam" || initialDurationMinutes > 0),
  );
  const [scored, setScored] = useState(Boolean(savedSession.scored));
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(
    savedSession.result || null,
  );
  const [approxBand, setApproxBand] = useState<number | null>(
    savedSession.band ?? null,
  );
  const [showResultsModal, setShowResultsModal] = useState(false);
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
    context: string;
    pane: "passage" | "questions";
    x: number;
    y: number;
  } | null>(null);

  const passageRef = useRef<HTMLDivElement>(null);
  const questionsRef = useRef<HTMLDivElement>(null);

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
  const [reviewLoaded, setReviewLoaded] = useState(false);
  useEffect(() => {
    onSessionActive(!isPreview && (!scored || Boolean(historyError)));
    return () => onSessionActive(false);
  }, [isPreview, scored, historyError, onSessionActive]);
  const originalPart = test.parts[currentPartIndex] || test.parts[0];
  const part: EditablePart = {
    ...originalPart,
    questions: originalPart.questions.map((q) => ({
      ...q,
      ...reviewKeys[q.number],
    })),
  };
  const allQuestions = test.parts.flatMap((p) => p.questions);
  const allQuestionNumbers = allQuestions
    .map((q) => q.number)
    .sort((a, b) => a - b);
  const currentPartNumbers = part.questions.map((q) => q.number);

  // Save the exact session for refresh/recovery, including completed exams.
  useEffect(() => {
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
    responses,
    flags,
    notes,
    highlights,
    timerRemaining,
    scored,
    scoreResult,
    approxBand,
    onNotify,
  ]);

  // Timer updaters are pure; expiry submission happens once in an effect.
  const submitLatest = useRef<() => Promise<void>>(async () => {});
  const expired = useRef(false);
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(
      () => setTimerRemaining((prev: number) => Math.max(0, prev - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, [timerRunning]);
  useEffect(() => {
    if (!timerRunning || timerRemaining > 0 || expired.current) return;
    expired.current = true;
    setTimerRunning(false);
    if (mode === "exam" && !scored) void submitLatest.current();
    else onNotify("Time is up. You can continue practising.");
  }, [timerRemaining, timerRunning, mode, scored, onNotify]);

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
  const handleSubmit = async () => {
    if (scored) {
      setShowResultsModal(true);
      return;
    }
    if (submissionRef.current) return;
    submissionRef.current = true;
    setSubmitting(true);
    const wasRunning = timerRunning;
    const submissionOwner = auth.currentUser?.uid || "guest";
    setTimerRunning(false);
    try {
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
        setApproxBand(estimatedBand(result));
        setScored(true);
        setShowResultsModal(true);
        return;
      }
      const data = await assessmentRequest("/api/submit-exam", {
        ...submissionPayload(),
        attemptId,
      });
      setReviewKeys(data.keys || {});
      setReviewLoaded(true);
      setScoreResult(data.result);
      setApproxBand(data.band);
      setScored(true);
      setShowResultsModal(true);

      const attemptRecord: AttemptRecord = {
        id: data.attemptId || attemptId,
        owner: submissionOwner,
        testId: test.sourceTestId || test.id,
        testTitle: test.title,
        skill: test.skill,
        mode,
        createdAt: Date.now(),
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
  submitLatest.current = handleSubmit;

  const ensureReviewKeys = async () => {
    if (!scored) return false;
    if (isPreview || reviewLoaded) return true;
    try {
      const data = await assessmentRequest("/api/test-review", {
        ...submissionPayload(),
        mode: "practice",
      });
      setReviewKeys(data.keys || {});
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
      <AnswerControl
        slot={slot}
        part={part}
        responses={responses}
        showAnswers={scored && showAnswers}
        disabled={submitting || scored}
        onChange={handleInputChange}
        onMultiChange={handleMultiChoiceChange}
      />
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
    const text = s.toString().trim();
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

  const handleSelectionWord = () => {
    if (!selectionBox) return;
    onSaveVocabulary({
      word: selectionBox.text,
      meaning: "",
      example: selectionBox.context,
      partOfSpeech: "noun",
    });
    setSelectionBox(null);
  };

  const handleSelectionDictionary = async () => {
    if (!selectionBox) return;
    if (mode === "exam" && !scored) {
      onNotify("Dictionary lookup is disabled during an active exam.");
      return;
    }
    onNotify(`Looking up "${selectionBox.text}"…`);
    try {
      const res = await fetch("/api/dictionary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
        },
        body: JSON.stringify({
          text: selectionBox.text,
          context: selectionBox.context,
          language: profile.language,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await onSaveVocabulary({
          word: data.word || selectionBox.text,
          meaning: data.meaning,
          example: data.example || selectionBox.context,
          partOfSpeech: data.partOfSpeech || "noun",
        });
        onNotify(`Word "${data.word}" added to vocabulary.`);
      }
    } catch {
      onNotify("Dictionary lookup failed.");
    }
    setSelectionBox(null);
  };

  // Content Report submission
  const handleSendReport = async () => {
    if (!reportMessage.trim()) {
      onNotify("Please enter a description of the issue.");
      return;
    }
    try {
      await firestoreAdapter.put("reports", {
        id: `rep_${Date.now()}`,
        owner: profile.id,
        testId: test.id,
        testTitle: test.title,
        question: reportQuestion,
        category: reportCategory,
        message: reportMessage.trim(),
        status: "open",
        createdAt: Date.now(),
      });
      setShowReportModal(false);
      setReportMessage("");
      onNotify("Content issue reported for admin review.");
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err));
    }
  };

  const minutes = Math.floor(timerRemaining / 60);
  const seconds = timerRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const answeredCount = allQuestionNumbers.filter((n) =>
    Boolean(responses[n]?.trim()),
  ).length;

  return (
    <div
      className={`app ${mode === "exam" ? "exam-mode" : ""} ${scored ? "exam-finished" : ""}`}
      style={{ "--study-font-size": `${textSize}px` } as React.CSSProperties}
      onMouseUp={handleMouseUp}
    >
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
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button className="quiet-button" onClick={onReturnToLibrary}>
              ← Library
            </button>
            <div>
              <div className="eyebrow">
                {test.skill.toUpperCase()} ·{" "}
                {mode === "exam" ? "OFFICIAL EXAM SIMULATION" : "PRACTICE MODE"}
              </div>
              <div className="top-title">{test.title}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button
              className="quiet-button"
              onClick={() => setActiveDrawer("notes")}
            >
              Notes
            </button>
            <button
              className="quiet-button"
              onClick={() => setActiveDrawer("review")}
            >
              Review
            </button>
            <button
              className="quiet-button"
              onClick={() => {
                const qNum = currentPartNumbers[0] || 1;
                toggleFlag(qNum);
              }}
            >
              Flag
            </button>
            <button
              className="quiet-button"
              onClick={() => {
                setReportQuestion(currentPartNumbers[0] || 1);
                setShowReportModal(true);
              }}
            >
              Report
            </button>
            <button
              className="quiet-button"
              onClick={() => setShowDisplayModal(true)}
            >
              Aa
            </button>
            <button className="quiet-button" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </header>

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
        {/* Listening Audio Strip if audio is present */}
        {part.audio && (
          <div className="audio-strip">
            <span style={{ fontWeight: 600 }}>Section Audio:</span>
            <audio controls src={part.audio} />
          </div>
        )}

        {/* Section Tabs and Timer Toolbar */}
        <div className="work-toolbar">
          <nav className="part-tabs">
            {test.parts.map((p, idx) => (
              <button
                key={p.id || idx}
                className={`part-tab ${idx === currentPartIndex ? "active" : ""}`}
                onClick={() => setCurrentPartIndex(idx)}
              >
                {idx + 1}. {passageTitle(p.passageHtml, p.title, idx)}
              </button>
            ))}
          </nav>

          <div className="review-toggles">
            {scored && (
              <>
                <button
                  className="toggle"
                  aria-pressed={showAnswers}
                  onClick={() => void toggleReview("answers")}
                >
                  <span className="switch" />
                  Answers
                </button>
                <button
                  className="toggle"
                  aria-pressed={showExplanations}
                  onClick={() => void toggleReview("explanations")}
                >
                  <span className="switch" />
                  Explanations
                </button>
              </>
            )}

            <div className={`timer ${timerRemaining < 300 ? "low" : ""}`}>
              <span>{timeFormatted}</span>
              {mode === "practice" && !scored && (
                <button
                  className="timer-button"
                  onClick={() => setTimerRunning(!timerRunning)}
                >
                  {timerRunning ? "Ⅱ" : "▶"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Tab Toggle for narrow viewports */}
        <div className="mobile-tabs">
          <button
            className={`mobile-tab ${mobileTab === "passage" ? "active" : ""}`}
            onClick={() => setMobileTab("passage")}
          >
            Passage
          </button>
          <button
            className={`mobile-tab ${mobileTab === "questions" ? "active" : ""}`}
            onClick={() => setMobileTab("questions")}
          >
            Questions
          </button>
        </div>

        {/* Split-Screen Main Content */}
        <div
          className={`split-view ${showAnswers ? "show-answers" : ""} ${showExplanations ? "show-explanations" : ""}`}
        >
          {/* Left Pane: Passage Content */}
          <article
            ref={passageRef}
            className={`pane passage-pane ${mobileTab === "questions" ? "mobile-hidden" : ""}`}
          >
            <div className="pane-label">
              {passageTitle(part.passageHtml, part.title, currentPartIndex)}
            </div>

            <div className="reading-content">
              <QuestionLayout html={part.passageHtml} renderSlot={renderSlot} />
            </div>
          </article>

          {/* Right Pane: Questions Content */}
          <section
            ref={questionsRef}
            className={`pane questions-pane ${mobileTab === "passage" ? "mobile-hidden" : ""}`}
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
                  html={part.questionHtml}
                  renderSlot={renderSlot}
                />
              )}
              {orphanSlots.map((slot) => (
                <div key={slot.id}>{renderSlot(slot.id)}</div>
              ))}

              {/* Explanations Section */}
              {scored && showExplanations && <div className="explanation-section">
                <h2>Explanations</h2>
                {part.questions.filter((q) => q.explanationHtml).length ===
                0 ? (
                  <p>No explanations stored for this section.</p>
                ) : (
                  part.questions.map((q) => {
                    if (!q.explanationHtml) return null;
                    return (
                      <article key={q.number} className="explanation-card">
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <h3>Question {q.number}</h3>
                          {q.referenceQuote && (
                            <button
                              className="studio-quiet"
                              style={{ fontSize: "10px", padding: "4px 8px" }}
                              onClick={() =>
                                handleLocateQuote(q.referenceQuote!)
                              }
                            >
                              Locate quote in passage
                            </button>
                          )}
                        </div>
                        <p className="solution-answer"><strong>Correct answer:</strong> {q.answer ? q.answer.split("||").join(" / ") : "Not provided"}</p>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: cleanLayout(q.explanationHtml || ""),
                          }}
                        />
                      </article>
                    );
                  })
                )}
              </div>}
            </div>
          </section>
        </div>

        {/* Bottom Bar & Question Navigation */}
        <footer className="bottom-bar">
          <div className="bottom-meta">
            <div>
              {scoreResult ? (
                <span
                  style={{
                    fontWeight: 600,
                    color: "var(--teal)",
                    fontSize: "13px",
                  }}
                >
                  Score: {scoreResult.correct} / {scoreResult.gradable}
                  {scoreResult.ungraded > 0 &&
                    ` (${scoreResult.ungraded} ungraded)`}
                  {approxBand !== null && ` · IELTS Band ${approxBand.toFixed(1)}`}
                </span>
              ) : (
                <span style={{ fontSize: "12px" }}>
                  {answeredCount} of {allQuestionNumbers.length} answered
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                className="studio-primary"
                disabled={submitting || isLegacyBroken}
                onClick={() => void handleSubmit()}
                style={{ padding: "8px 16px", fontSize: "12px" }}
              >
                {scored ? "Review Score" : "Submit & Review"}
              </button>

              <button
                className="quiet-button"
                disabled={submitting}
                onClick={() => {
                  setResetAction("reset");
                }}
              >
                Reset responses
              </button>
            </div>
          </div>

          <nav className="question-nav" aria-label="Question navigation">
            {allQuestionNumbers.map((qNum) => {
              const isCurrentPart = currentPartNumbers.includes(qNum);
              const isAnswered = Boolean(responses[qNum]?.trim());
              const isFlagged = flags.includes(qNum);

              // Row status if scored
              const scoreStatus = scoreResult?.rows.find(
                (r: ScoreRow) => r.number === qNum,
              )?.status;

              return (
                <button
                  key={qNum}
                  className={`question-chip ${isCurrentPart ? "current-part" : ""} ${
                    isAnswered ? "answered" : ""
                  } ${isFlagged ? "flagged" : ""}`}
                  data-score={scoreStatus}
                  onClick={() => handleJump(qNum)}
                  title={`Question ${qNum}${scoreStatus ? ` (${scoreStatus})` : ""}`}
                >
                  {qNum}
                </button>
              );
            })}
          </nav>
        </footer>
      </main>

      {/* Floating Selection Tools */}
      {selectionBox && (
        <div
          className="selection-tools"
          style={{ left: `${selectionBox.x}px`, top: `${selectionBox.y}px` }}
        >
          <button onClick={handleSelectionHighlight}>Highlight</button>
          <button onClick={handleSelectionNote}>Note</button>
          <button onClick={handleSelectionWord}>Save word</button>
          <button onClick={handleSelectionDictionary}>Dictionary (AI)</button>
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

              <div style={{ display: "grid", gap: "10px" }}>
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
                      <span className="studio-small">Section {n.part + 1}</span>
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
                        <strong>Question {n}</strong>
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

      {/* Results Modal Dialog */}
      {showResultsModal && scoreResult && (
        <dialog
          className="results-panel"
          open
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 130,
          }}
        >
          <div className="results-header">
            <h2>Your Reading Result</h2>
            <button
              className="quiet-button"
              onClick={() => setShowResultsModal(false)}
            >
              Close
            </button>
          </div>

          <div className="result-score">
            {scoreResult.correct} / {scoreResult.gradable}
          </div>

          {approxBand !== null ? (
            <div
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--teal)",
                marginBottom: "8px",
              }}
            >
              IELTS Academic Reading Band: {approxBand.toFixed(1)}
            </div>
          ) : <p className="result-note">A band is available for a complete 40-question test with all answer keys. Single passages receive a raw score.</p>}

          <p style={{ margin: "6px 0 14px" }}>
            {scoreResult.incorrect} incorrect · {scoreResult.blank} unanswered
            {scoreResult.ungraded > 0 &&
              ` · ${scoreResult.ungraded} ungraded (source missing or ungraded)`}
          </p>

          <p className="result-note">
            Practice score based on the uploaded answer keys (ignoring case and
            whitespace). Band estimates are approximate and valid for complete
            40-question tests.
          </p>

          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Your Answer</th>
                  <th>Accepted Answer</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {scoreResult.rows.map((row: ScoreRow) => (
                  <tr key={row.number} data-score={row.status}>
                    <td>Question {row.number}</td>
                    <td>{row.response || "—"}</td>
                    <td>
                      {row.answer ? row.answer.split("||").join(" / ") : "—"}
                    </td>
                    <td>
                      {row.status === "ungraded" ? "Needs review" : row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              className="studio-primary"
              onClick={async () => {
                if (!(await ensureReviewKeys())) return;
                setShowResultsModal(false);
                setShowAnswers(true);
                setShowExplanations(true);
              }}
            >
              Review Test Questions with Answers
            </button>
          </div>
        </dialog>
      )}

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
            <select
              value={reportQuestion}
              onChange={(e) => setReportQuestion(Number(e.target.value))}
            >
              {allQuestionNumbers.map((n) => (
                <option key={n} value={n}>
                  Question {n}
                </option>
              ))}
            </select>
          </label>

          <label className="studio-field">
            Issue Category
            <select
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
            >
              <option value="typo">Wording / Typo in Question</option>
              <option value="answer">Answer Key Discrepancy</option>
              <option value="explanation">Explanation Error</option>
              <option value="missing">Missing Content</option>
              <option value="other">Other</option>
            </select>
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

      {/* Display Settings Dialog */}
      {showDisplayModal && (
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
            <h2>Reading Display Settings</h2>
            <button
              className="studio-quiet"
              onClick={() => setShowDisplayModal(false)}
            >
              ✕
            </button>
          </div>

          <label className="studio-field">
            Font Size
            <select
              value={textSize}
              onChange={(e) => {
                setTextSize(Number(e.target.value));
              }}
            >
              <option value={14}>Compact (14px)</option>
              <option value={16}>Small (16px)</option>
              <option value={18}>Comfortable (18px)</option>
              <option value={20}>Large (20px)</option>
              <option value={22}>Extra large (22px)</option>
              <option value={24}>Maximum (24px)</option>
            </select>
          </label>

          <label className="studio-field">
            Theme
            <select
              value={profile.theme}
              onChange={(e) => {
                document.body.classList.toggle(
                  "studio-dark",
                  e.target.value === "dark",
                );
              }}
            >
              <option value="light">Light Paper</option>
              <option value="dark">Dark Room</option>
            </select>
          </label>

          <div className="studio-actions" style={{ marginTop: "20px" }}>
            <button
              className="studio-primary"
              onClick={() => setShowDisplayModal(false)}
            >
              Done
            </button>
            <button
              className="studio-secondary studio-danger"
              onClick={() => {
                setResetAction("restart");
              }}
            >
              Restart Test
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
};
