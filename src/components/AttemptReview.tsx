import React, {useEffect, useState} from 'react';
import type {AttemptRecord, EditableTest, UserProfile} from '../types';
import {firestoreAdapter} from '../services/firestoreAdapter';
import {loadAttemptDefinition} from '../services/attemptReview';
import {TestWorkspace} from './TestWorkspace';
import {FullExamSession} from './FullExamSession';

const noop = () => {};
export function AttemptReview({attempt, profile, onBack}: {attempt: AttemptRecord; profile: UserProfile; onBack: () => void}) {
  const [test, setTest] = useState<EditableTest | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true; setTest(null); setError('');
    void loadAttemptDefinition(attempt, id => firestoreAdapter.getTestComplete(id)).then(value => {if (alive) setTest(value);}).catch(e => {if (alive) setError(e.message || 'Could not open this attempt.');});
    return () => {alive = false;};
  }, [attempt.id, attempt.owner, retry]);
  if (error) return <section className="studio-panel"><h2>Review could not load</h2><p role="alert">{error}</p><p>The saved result above is still available. This link will never start a new test.</p><button className="studio-secondary" onClick={() => setRetry(n => n + 1)}>Retry review</button></section>;
  if (!test) return <p role="status">Loading this attempt's questions and saved answers…</p>;
  return <FullExamSession><div className="attempt-review-label"><span>Saved attempt · {new Date(attempt.completedAt || attempt.createdAt).toLocaleString()} · {attempt.result.correct}/{attempt.result.gradable} correct</span><span>Answers and score are from this attempt; passage content and explanations use the current test.</span>{notice && <span role="status">{notice}</span>}</div><TestWorkspace test={test} sessionId={'review:' + attempt.owner + ':' + attempt.id} initialAttempt={attempt} initialSolution mode={attempt.mode} initialDurationMinutes={0} profile={profile} onReturnToLibrary={onBack} onSessionActive={noop} onHistorySaved={noop} onNotify={setNotice} onSaveVocabulary={async () => {throw Error('Open your Vocabulary page to save words.');}}/></FullExamSession>;
}
