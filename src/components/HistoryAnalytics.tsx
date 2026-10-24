import React, {useMemo, useState} from 'react';
import type {AttemptRecord} from '../types';
import {Select} from './Select';
import {breakdown, summarize, percent, formatDuration, progressChange, studyActivity, testSummaries, attemptTime, type Breakdown} from '../services/historyAnalytics';

function Metric({label, value, note}: {label: string; value: React.ReactNode; note?: string}) {
  return <div className="history-stat"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
function BreakdownTable({attempts, by}: {attempts: AttemptRecord[]; by: 'type' | 'part'}) {
  const [order, setOrder] = useState('errors');
  const rows = useMemo(() => {
    const groups = breakdown(attempts, by);
    return order === 'rate' ? groups.sort((a, b) => (b.errorRate ?? -1) - (a.errorRate ?? -1) || b.gradable - a.gradable) : groups;
  }, [attempts, by, order]);
  if (!rows.length) return <p className="studio-small">No question data in this selection.</p>;
  return <><div className="history-table-tools"><p>Missed = incorrect + blank. Ungraded questions are excluded from accuracy.</p><label>Rank by<Select aria-label={'Rank ' + by + ' statistics'} value={order} onChange={e => setOrder(e.target.value)}><option value="errors">Most questions missed</option><option value="rate">Highest error rate</option></Select></label></div><div className="table-scroll"><table className="studio-table history-breakdown"><thead><tr><th>{by === 'type' ? 'Question type' : 'Passage / part'}</th><th>Skill</th><th>Questions</th><th>Correct</th><th>Incorrect</th><th>Blank</th><th>Ungraded</th><th>Missed</th><th>Error rate</th><th>Accuracy</th></tr></thead><tbody>{rows.map(g => <tr key={g.key}><th scope="row">{g.label}<small>{g.sessions} session{g.sessions !== 1 ? 's' : ''}</small></th><td>{g.skill}</td><td>{g.total}</td><td>{g.correct}</td><td>{g.incorrect}</td><td>{g.blank}</td><td>{g.ungraded}</td><td><strong>{g.errors}</strong></td><td>{percent(g.errorRate)}</td><td><span className="history-accuracy">{percent(g.accuracy)}<progress aria-label={g.label + ' accuracy'} value={g.correct} max={g.gradable || 1}/></span></td></tr>)}</tbody></table></div></>;
}
function FocusCard({group, skill}: {group?: Breakdown; skill: string}) {
  return <div className="history-focus"><small>{skill} · biggest source of lost marks</small><strong>{group?.label || 'No recorded weakness yet'}</strong><p>{group ? group.errors + ' missed out of ' + group.gradable + ' gradable questions · ' + percent(group.errorRate) + ' error rate. ' + group.incorrect + ' incorrect, ' + group.blank + ' blank.' : 'Question type data and at least one missed question are needed.'}</p>{group && group.gradable < 10 && <small>Small sample — practise more before drawing conclusions.</small>}</div>;
}
export function HistoryAnalytics({attempts, single = false, getAttemptPath}: {attempts: AttemptRecord[]; single?: boolean; getAttemptPath?: (id: string) => string}) {
  const stats = useMemo(() => summarize(attempts), [attempts]);
  const activity = useMemo(() => studyActivity(attempts), [attempts]);
  const types = useMemo(() => breakdown(attempts, 'type'), [attempts]);
  const perTest = useMemo(() => single ? [] : testSummaries(attempts), [attempts, single]);
  const skills = (['reading', 'listening'] as const).filter(skill => attempts.some(a => a.skill === skill));
  const recent = [...attempts].sort((a, b) => attemptTime(a) - attemptTime(b)).slice(-12);
  if (!attempts.length) return null;
  return <div className="history-analytics">
    <section className="history-stat-grid" aria-label={single ? 'Session statistics' : 'History statistics'}>
      <Metric label="Accuracy" value={percent(stats.accuracy)} note={stats.correct + ' / ' + stats.gradable + ' gradable questions'}/>
      <Metric label="Answered accuracy" value={percent(stats.answeredAccuracy)} note="Correct / nonblank, gradable answers"/>
      <Metric label="Completion" value={percent(stats.completion)} note={stats.blank + ' blank · ' + stats.ungraded + ' ungraded'}/>
      <Metric label={single ? 'Time spent' : 'Recorded study time'} value={stats.timedSessions ? formatDuration(stats.totalSeconds) : 'Not recorded'} note={stats.timedSessions + ' / ' + stats.sessions + ' sessions timed'}/>
      {!single && <><Metric label="Completed sessions" value={stats.sessions} note={stats.uniqueTests + ' distinct test selections'}/><Metric label="Average session time" value={formatDuration(stats.averageSeconds)} note={'Median: ' + formatDuration(stats.medianSeconds)}/></>}
      <Metric label="Average time / question" value={stats.secondsPerQuestion == null ? 'Not recorded' : stats.secondsPerQuestion.toFixed(1) + 's'} note="Session time / gradable questions; not individual timing"/>
      <Metric label="Question type coverage" value={percent(stats.total ? stats.typedQuestions / stats.total : null)} note={stats.typedQuestions + ' / ' + stats.total + ' questions have a type'}/>
    </section>
    <section className="studio-panel"><div className="section-heading"><div><span className="studio-eyebrow">NEXT PRACTICE FOCUS</span><h2>{single ? 'Where this attempt lost marks' : 'Where you lose the most marks'}</h2></div></div><div className="history-focus-grid">{skills.map(skill => <FocusCard key={skill} skill={skill} group={types.find(g => g.skill === skill && g.errors > 0 && g.label !== 'Type not recorded')}/>)}</div><p className="studio-small">Ranked by total missed questions. Compare error rates and sample sizes in the table below.</p>
      <details open={single}><summary>Question type breakdown</summary><BreakdownTable attempts={attempts} by="type"/></details>
      <details open={single}><summary>Passage / part breakdown</summary><BreakdownTable attempts={attempts} by="part"/></details>
      {stats.typedQuestions < stats.total && <p className="history-data-note">Some older results have no question type or part labels. They remain in overall scores and appear as “not recorded” in breakdowns. New submissions save these labels automatically.</p>}
    </section>
    {!single && <>
      <section className="studio-panel"><div className="section-heading"><h2>Reading & Listening</h2><span>Separate skill estimates</span></div><div className="history-skill-grid">{skills.map(skill => {
        const sessions = attempts.filter(a => a.skill === skill), s = summarize(sessions), change = progressChange(sessions);
        return <article key={skill} className="history-skill-card"><h3>{skill === 'reading' ? 'Reading' : 'Listening'}</h3><dl><div><dt>Accuracy</dt><dd>{percent(s.accuracy)}</dd></div><div><dt>Average estimated band</dt><dd>{s.averageBand?.toFixed(1) ?? '—'}</dd></div><div><dt>Best estimated band</dt><dd>{s.bestBand?.toFixed(1) ?? '—'}</dd></div><div><dt>Sessions / band estimates</dt><dd>{s.sessions} / {s.bandSessions}</dd></div><div><dt>Recorded time</dt><dd>{s.timedSessions ? formatDuration(s.totalSeconds) : 'Not recorded'}</dd></div><div><dt>Accuracy change</dt><dd>{change ? (change.difference > 0 ? '+' : '') + change.difference.toFixed(1) + ' pp' : 'Need 2 sessions'}</dd></div></dl><p className="studio-small">{change ? 'First ' + change.size + ' vs latest ' + change.size + ' sessions in this selection. Difficulty and repeated tests may differ.' : 'Complete more sessions to compare progress.'}</p></article>;
      })}</div><p className="studio-small">Bands are estimates for supported, fully gradable 40-question tests. Mini-test accuracy is included; mini-test bands are not invented.</p></section>
      <section className="studio-panel"><div className="section-heading"><h2>Recent accuracy</h2><span>Latest {recent.length} sessions · oldest to newest</span></div><div className="history-trend" role="list" aria-label="Recent accuracy by session">{recent.map(a => {
        const s = summarize([a]), href = getAttemptPath?.(a.id) || '/history/' + encodeURIComponent(a.id);
        return <a key={a.id} role="listitem" href={href} title={a.testTitle + ' · ' + percent(s.accuracy)}><span>{percent(s.accuracy)}</span><div><i style={{height: Math.max(s.accuracy == null ? 0 : 2, (s.accuracy || 0) * 100) + '%'}} className={a.skill}/></div><small>{new Date(attemptTime(a)).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</small><small>{a.skill === 'reading' ? 'R' : 'L'}</small></a>;
      })}</div></section>
      <section className="studio-panel"><h2>Study habits</h2><div className="history-stat-grid compact"><Metric label="Active study days" value={activity.activeDays}/><Metric label="Current streak" value={activity.streak + ' days'} note="Consecutive days ending today or yesterday"/><Metric label="Sessions this week" value={activity.thisWeek} note="Week starts Monday; current selection"/><Metric label="Repeat sessions" value={stats.sessions - stats.uniqueTests} note="Sessions beyond the first per test selection"/></div></section>
      <section className="studio-panel"><h2>By test</h2><p className="studio-small">Full tests, mini tests and custom selections are grouped separately. Open an attempt to see its own breakdown.</p><div className="table-scroll"><table className="studio-table"><thead><tr><th>Test</th><th>Sessions</th><th>Accuracy</th><th>Recorded time</th><th>Most missed type</th><th>First → latest accuracy</th><th>Latest attempt</th></tr></thead><tbody>{perTest.map(t => <tr key={t.key}><th scope="row">{t.title}<small>{t.skill}</small></th><td>{t.summary.sessions}</td><td>{percent(t.summary.accuracy)}</td><td>{t.summary.timedSessions ? formatDuration(t.summary.totalSeconds) : 'Not recorded'}</td><td>{t.weakest ? t.weakest.label + ' · ' + t.weakest.errors + ' missed' : '—'}</td><td>{t.change == null ? 'Need 2 attempts' : (t.change > 0 ? '+' : '') + t.change.toFixed(1) + ' pp'}</td><td><a className="text-link" href={getAttemptPath?.(t.latest.id) || '/history/' + encodeURIComponent(t.latest.id)}>View result</a></td></tr>)}</tbody></table></div></section>
    </>}
  </div>;
}
