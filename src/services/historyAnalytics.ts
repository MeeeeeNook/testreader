import type {AttemptRecord, ScoreRow} from '../types';
import {questionFamily, questionTypesForSkill} from './portal';

export const attemptTime = (a: AttemptRecord) => a.completedAt || a.createdAt;
export const percent = (value: number | null) => value == null ? '—' : (value * 100).toFixed(1) + '%';
export const formatDuration = (value: number | null | undefined) => value == null || !Number.isFinite(value) || value < 0 ? 'Not recorded' : value >= 3600 ? Math.floor(value / 3600) + 'h ' + Math.floor(value % 3600 / 60) + 'm' : Math.floor(value / 60) + 'm ' + Math.floor(value % 60) + 's';
export const validDuration = (a: AttemptRecord) => typeof a.elapsedSeconds === 'number' && Number.isFinite(a.elapsedSeconds) && a.elapsedSeconds >= 0 && a.elapsedSeconds <= 604800;
export function typeLabel(kind?: string, skill = 'reading') {
  if (!kind?.trim()) return 'Type not recorded';
  const known = /short.?answer|heading|multiple.choice|matching|map|plan|diagram|label|sentence|yes.no|true.false|fill.blank|summary|form|note|table|flow.chart/i.test(kind);
  if (!known) return kind.replace(/_/g, ' ');
  const family = questionFamily(kind);
  return questionTypesForSkill(skill).find(([key]) => key === family)?.[1] || kind.replace(/_/g, ' ');
}
export function rowMetadata(attempt: AttemptRecord, row: ScoreRow) {
  // A legacy in-memory definition can supply missing labels; never infer them from an answer.
  const part = attempt.definition?.parts.find(p => p.questions.some(q => q.number === row.number));
  const question = part?.questions.find(q => q.number === row.number);
  return {kind: row.kind || question?.kind, part: row.part || part?.position || (part ? attempt.definition!.parts.indexOf(part) + 1 : undefined)};
}
export function attemptScope(a: AttemptRecord) {
  return a.sourceSections?.length ? JSON.stringify(a.sourceSections) : a.testId + ':' + (a.sectionIds?.length ? [...a.sectionIds].sort().join(',') : 'full');
}
export interface Totals {
  correct: number; incorrect: number; blank: number; ungraded: number; total: number;
  gradable: number; answered: number; accuracy: number | null; answeredAccuracy: number | null; completion: number | null;
}
export function countRows(rows: ScoreRow[]): Totals {
  const counts = {correct: 0, incorrect: 0, blank: 0, ungraded: 0, total: rows.length};
  for (const row of rows) counts[row.status]++;
  const gradable = counts.total - counts.ungraded, answered = counts.correct + counts.incorrect;
  return {...counts, gradable, answered, accuracy: gradable ? counts.correct / gradable : null,
    answeredAccuracy: answered ? counts.correct / answered : null, completion: gradable ? answered / gradable : null};
}
export interface Breakdown extends Totals {key: string; label: string; skill: string; sessions: number; errors: number; errorRate: number | null}
export function breakdown(attempts: AttemptRecord[], by: 'type' | 'part'): Breakdown[] {
  const groups = new Map<string, {label: string; skill: string; rows: ScoreRow[]; sessions: Set<string>}>();
  for (const a of attempts) for (const row of a.result.rows) {
    const meta = rowMetadata(a, row);
    const label = by === 'type' ? typeLabel(meta.kind, a.skill) : meta.part ? (a.skill === 'listening' ? 'Part ' : 'Passage ') + meta.part : 'Part not recorded';
    const key = a.skill + ':' + label;
    if (!groups.has(key)) groups.set(key, {label, skill: a.skill, rows: [], sessions: new Set()});
    const group = groups.get(key)!; group.rows.push(row); group.sessions.add(a.id);
  }
  return [...groups].map(([key, g]) => {
    const totals = countRows(g.rows), errors = totals.incorrect + totals.blank;
    return {...totals, key, label: g.label, skill: g.skill, sessions: g.sessions.size, errors, errorRate: totals.gradable ? errors / totals.gradable : null};
  }).sort((a, b) => b.errors - a.errors || (b.errorRate || 0) - (a.errorRate || 0) || a.label.localeCompare(b.label));
}
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function summarize(attempts: AttemptRecord[]) {
  const rows = attempts.flatMap(a => a.result.rows), totals = countRows(rows);
  const timed = attempts.filter(validDuration), durations = timed.map(a => a.elapsedSeconds!).sort((a, b) => a - b);
  const totalSeconds = durations.reduce((a, b) => a + b, 0), middle = Math.floor(durations.length / 2);
  const withGradable = timed.filter(a => a.result.rows.some(r => r.status !== 'ungraded'));
  const questionSeconds = withGradable.reduce((sum, a) => sum + a.elapsedSeconds!, 0);
  const timedQuestions = withGradable.reduce((sum, a) => sum + a.result.rows.filter(r => r.status !== 'ungraded').length, 0);
  const bands = attempts.map(a => a.band).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  return {...totals, sessions: attempts.length, uniqueTests: new Set(attempts.map(attemptScope)).size,
    timedSessions: timed.length, totalSeconds, averageSeconds: average(durations),
    medianSeconds: durations.length ? durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2 : null,
    secondsPerQuestion: timedQuestions ? questionSeconds / timedQuestions : null,
    averageBand: average(bands), bestBand: bands.length ? Math.max(...bands) : null, bandSessions: bands.length,
    typedQuestions: attempts.reduce((sum, a) => sum + a.result.rows.filter(r => !!rowMetadata(a, r).kind?.trim()).length, 0)};
}
export interface HistoryFilters {skill: string; mode: string; days: number; test: string; search: string}
export function filterHistory(attempts: AttemptRecord[], filters: HistoryFilters, now = Date.now()) {
  const cutoff = filters.days ? now - filters.days * 86400000 : -Infinity;
  return attempts.filter(a => (!filters.skill || a.skill === filters.skill) && (!filters.mode || a.mode === filters.mode) &&
    attemptTime(a) >= cutoff && (!filters.test || attemptScope(a) === filters.test) &&
    a.testTitle.toLowerCase().includes(filters.search.trim().toLowerCase()));
}
export function localDay(time: number) {
  const d = new Date(time); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function studyActivity(attempts: AttemptRecord[], now = Date.now()) {
  const days = new Set(attempts.map(a => localDay(attemptTime(a))));
  const date = new Date(now); let streak = 0;
  if (!days.has(localDay(date.getTime()))) date.setDate(date.getDate() - 1);
  while (days.has(localDay(date.getTime()))) {streak++; date.setDate(date.getDate() - 1);}
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
  return {activeDays: days.size, streak, thisWeek: attempts.filter(a => attemptTime(a) >= weekStart.getTime()).length};
}
export function progressChange(attempts: AttemptRecord[]) {
  const ordered = [...attempts].filter(a => a.result.rows.some(r => r.status !== 'ungraded')).sort((a, b) => attemptTime(a) - attemptTime(b));
  const size = Math.min(5, Math.floor(ordered.length / 2));
  if (!size) return null;
  const before = summarize(ordered.slice(0, size)).accuracy!, after = summarize(ordered.slice(-size)).accuracy!;
  return {size, before, after, difference: (after - before) * 100};
}
export function testSummaries(attempts: AttemptRecord[]) {
  const groups = new Map<string, AttemptRecord[]>();
  for (const a of attempts) {const key = attemptScope(a); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(a);}
  return [...groups].map(([key, sessions]) => {
    const sorted = [...sessions].sort((a, b) => attemptTime(a) - attemptTime(b)), latest = sorted.at(-1)!;
    const firstAccuracy = summarize([sorted[0]]).accuracy, latestAccuracy = summarize([latest]).accuracy;
    return {key, title: latest.testTitle, skill: latest.skill, latest, summary: summarize(sorted),
      change: sorted.length > 1 && firstAccuracy != null && latestAccuracy != null ? (latestAccuracy - firstAccuracy) * 100 : null,
      weakest: breakdown(sorted, 'type').find(g => g.errors > 0 && g.label !== 'Type not recorded')};
  }).sort((a, b) => attemptTime(b.latest) - attemptTime(a.latest));
}
