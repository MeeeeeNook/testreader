import {ScoreAnalysis} from './ScoreAnalysis';
import {PaginatedTable} from './PaginatedTable';
import {HistoryAnalytics} from './HistoryAnalytics';
import {Select} from './Select';
import React, {useMemo, useState, Suspense} from 'react';
import {ArrowLeft, ArrowUpRight, Clock, TrendingUp} from 'lucide-react';
import type {AttemptRecord, UserProfile} from '../types';
import {attemptReviewPath} from '../services/attemptReview';
import {attemptScope, attemptTime, filterHistory, formatDuration, percent, summarize, type HistoryFilters} from '../services/historyAnalytics';

const AttemptReview = React.lazy(() => import('./AttemptReview').then(m => ({default: m.AttemptReview})));
interface Props {
  attempts: AttemptRecord[];
  readOnly?: boolean;
  review?: boolean;
  getAttemptPath?: (id: string) => string;
  profile: UserProfile;
  selectedAttemptId?: string;
  onSelectAttempt: (id: string) => void;
  onBack: () => void;
  onOpenProfileModal: () => void;
  onReopenAttempt?: (attempt: AttemptRecord) => void;
}
const sessionMode = (mode: unknown) => mode === 'exam' ? 'Test mode' : mode === 'practice' ? 'Practice mode' : 'Mode not recorded';
const date = (time: number) => new Date(time).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
const defaults: HistoryFilters = {skill: '', mode: '', days: 0, test: '', search: ''};
export const ProgressView: React.FC<Props> = ({attempts, readOnly = false, review = false, getAttemptPath, profile, selectedAttemptId, onSelectAttempt, onBack, onOpenProfileModal}) => {
  const [filters, setFilters] = useState<HistoryFilters>(defaults), [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const selected = attempts.find(a => a.id === selectedAttemptId);
  const pathFor = (id: string) => getAttemptPath?.(id) || '/history/' + encodeURIComponent(id);
  const Table = readOnly ? PaginatedTable : 'table';
  const update = (key: keyof HistoryFilters, value: string | number) => {setFilters(previous => ({...previous, [key]: value})); setPage(1);};
  const visible = useMemo(() => {
    const list = filterHistory(attempts, filters);
    return list.sort((a, b) => sort === 'accuracy' ? (summarize([a]).accuracy ?? 2) - (summarize([b]).accuracy ?? 2) || attemptTime(b) - attemptTime(a) : sort === 'time' ? (b.elapsedSeconds ?? -1) - (a.elapsedSeconds ?? -1) : attemptTime(b) - attemptTime(a));
  }, [attempts, filters, sort]);
  const testOptions = useMemo(() => [...new Map(attempts.map(a => [attemptScope(a), a])).entries()].sort((a, b) => a[1].testTitle.localeCompare(b[1].testTitle)), [attempts]);
  const open = (e: React.MouseEvent, id: string) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0) {e.preventDefault(); onSelectAttempt(id);}
  };
  if (selectedAttemptId) return <div className="history-page">
    <button className="text-link" onClick={onBack}><ArrowLeft size={16}/> All history</button>
    {!selected ? <div className="studio-empty"><h1>Result unavailable</h1><p>This result may belong to another account or device. Sign in to sync your history.</p></div> : <>
      <div className="studio-page-head"><div><span className="studio-eyebrow">{readOnly ? 'STUDENT SESSION REVIEW' : 'YOUR SESSION REVIEW'}</span><h1 className="studio-heading">{selected.testTitle}</h1><p className="studio-lead">{date(attemptTime(selected))} · {sessionMode(selected.mode)} · {selected.skill} · {formatDuration(selected.elapsedSeconds)}</p></div>
        <a className="studio-secondary" href={attemptReviewPath(selected.id, getAttemptPath)} target="_blank" rel="noopener noreferrer">Open this test <ArrowUpRight size={16}/><span className="sr-only">Review this attempt in a new tab</span></a>
      </div>
      <section className="result-hero"><div><span>Estimated IELTS band</span><strong>{selected.band?.toFixed(1) ?? '—'}</strong><small>Estimates are available for supported 40-question tests.</small></div><div><strong>{selected.result.correct}<small> / {selected.result.gradable}</small></strong><span>correct answers</span><small>{selected.syncedAt ? 'Saved to your account' : 'Saved on this device'}</small></div></section>
      <div className="result-counts">{(['correct', 'incorrect', 'blank', 'ungraded'] as const).map(status => <div className={'count-' + status} key={status}><strong>{selected.result[status]}</strong><span>{status}</span></div>)}</div>
      {review && <Suspense fallback={<p role="status">Loading attempt review…</p>}><AttemptReview key={selected.owner + selected.id} attempt={selected} profile={profile} onBack={() => onSelectAttempt(selected.id)}/></Suspense>}
      <HistoryAnalytics attempts={[selected]} single/>
      <section className="studio-panel"><ScoreAnalysis result={selected.result} skill={selected.skill}/><h2>Question breakdown</h2><div className="table-scroll"><Table className="studio-table result-table"><thead><tr><th>Question</th><th>Your answer</th><th>Accepted answer</th><th>Result</th></tr></thead><tbody>{selected.result.rows.map(row => <tr key={row.number}><th scope="row">{row.number}</th><td>{row.response || '—'}</td><td>{row.answer || '—'}</td><td><span className={'result-status ' + row.status}>{row.status}</span></td></tr>)}</tbody></Table></div></section>
    </>}
  </div>;
  return <div className="history-page">
    <div className="studio-page-head"><div><span className="studio-eyebrow">YOUR STUDY JOURNAL</span><h1 className="studio-heading">Your progress, in detail.</h1><p className="studio-lead">See what is improving, where marks are lost, and what to practise next.</p></div><button className="studio-secondary" disabled={readOnly} onClick={onOpenProfileModal}>{readOnly ? 'Student target' : 'Set your target'} · {profile.target.toFixed(1)} <ArrowUpRight size={16}/></button></div>
    {attempts.length > 0 && <>
      <section className="history-filters studio-panel" aria-label="History filters">
        <label>Skill<Select aria-label="History skill" value={filters.skill} onChange={e => update('skill', e.target.value)}><option value="">Reading & Listening</option><option value="reading">Reading</option><option value="listening">Listening</option></Select></label>
        <label>Mode<Select aria-label="History mode" value={filters.mode} onChange={e => update('mode', e.target.value)}><option value="">Practice & Test</option><option value="practice">Practice</option><option value="exam">Test</option></Select></label>
        <label>Period<Select aria-label="History period" value={filters.days} onChange={e => update('days', Number(e.target.value))}><option value={0}>All time</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option></Select></label>
        <label>Test<Select aria-label="History test" value={filters.test} onChange={e => update('test', e.target.value)}><option value="">All tests</option>{testOptions.map(([key, a]) => <option key={key} value={key}>{a.testTitle} · {a.skill} · {a.sourceSections?.length ? 'custom selection' : a.sectionIds?.length ? 'selected parts' : 'full test'}</option>)}</Select></label>
        <label className="history-search">Search sessions<input value={filters.search} placeholder="Test title" onChange={e => update('search', e.target.value)}/></label>
        <button className="studio-quiet" onClick={() => {setFilters(defaults); setPage(1);}}>Reset filters</button>
        <p className="studio-small history-filter-summary" role="status">{visible.length} of {attempts.length} saved sessions · all statistics below use this selection.</p>
      </section>
      <HistoryAnalytics attempts={visible} getAttemptPath={getAttemptPath}/>
      <div className="section-heading"><h2>Your sessions</h2><label>Sort<Select aria-label="Sort history sessions" value={sort} onChange={e => {setSort(e.target.value); setPage(1);}}><option value="recent">Most recent</option><option value="accuracy">Lowest accuracy first</option><option value="time">Longest time first</option></Select></label></div>
      <div className="history-list">{visible.slice(0, page * 20).map(a => <a key={a.id} className="history-card" href={pathFor(a.id)} onClick={e => open(e, a.id)}><span className="history-icon"><Clock size={22}/></span><div><span className="collection-label">{sessionMode(a.mode)} · {a.skill}</span><h3>{a.testTitle}</h3><small>{date(attemptTime(a))} · {formatDuration(a.elapsedSeconds)} · {percent(summarize([a]).accuracy)} accuracy · {a.syncedAt ? 'Synced to account' : 'Saved on this device'}</small></div><div className="history-score"><strong>{a.band?.toFixed(1) ?? a.result.correct + '/' + a.result.gradable}</strong><span>{a.band == null ? 'correct' : 'estimated band'}</span></div><ArrowUpRight size={19}/></a>)}</div>
      {visible.length > page * 20 && <button className="studio-secondary" onClick={() => setPage(n => n + 1)}>Show more sessions</button>}
      {!visible.length && <div className="studio-empty"><h3>No sessions match these filters.</h3><p>Change the selection or reset the filters to see your history.</p></div>}
    </>}
    {!attempts.length && <div className="studio-empty"><TrendingUp size={36}/><h3>Your story starts with one session.</h3><p>Finish a test to see your answers, score, and progress here. Sign in to sync saved results.</p></div>}
  </div>;
};
