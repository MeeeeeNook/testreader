import type { EditableTest } from '../types';

export function examMinutes(test: Pick<EditableTest, 'skill' | 'parts' | 'duration'>) {
  return test.skill === 'reading' ? Math.min(60, test.parts.length * 20) : Number.isFinite(test.duration) && Number(test.duration)>0 ? Math.min(180, Number(test.duration)) : test.parts.length === 4 ? 30 : test.parts.length * 10;
}

export function directSession(search: URLSearchParams, test: Pick<EditableTest, 'skill' | 'parts' | 'duration'>) {
  const mode = search.get('mode') === 'exam' ? 'exam' : 'practice';
  return { mode, minutes: mode === 'exam' ? examMinutes(test) : Math.max(0, Math.min(180, Number(search.get('minutes')) || 0)) } as const;
}

export function setupLink(testId: string, sectionId?: string) {
  return `/tests/${encodeURIComponent(testId)}${sectionId ? '/sections/' + encodeURIComponent(sectionId) : ''}`;
}
