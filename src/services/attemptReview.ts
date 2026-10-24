import type {AttemptRecord, EditableTest, EditablePart} from '../types';
export function attemptReviewPath(id: string, getPath?: (id: string) => string) {
  return (getPath?.(id) || '/history/' + encodeURIComponent(id)) + '?view=review';
}
export async function loadAttemptDefinition(attempt: AttemptRecord, load: (id: string) => Promise<EditableTest>): Promise<EditableTest> {
  const cache = new Map<string, Promise<EditableTest>>();
  const get = (id: string) => {if (!cache.has(id)) cache.set(id, load(id)); return cache.get(id)!;};
  let test: EditableTest;
  if (attempt.sourceSections?.length) {
    const sources = await Promise.all(attempt.sourceSections.map(async s => {
      const full = await get(s.testId), index = full.parts.findIndex(p => p.id === s.sectionId);
      const part = full.parts[index];
      if (!part) throw Error('A source part is no longer available.');
      return {...structuredClone(part), audioEnd: part.audioEnd || (full.parts[index + 1]?.audio === part.audio ? full.parts[index + 1]?.audioStart : undefined)};
    }));
    let next = 1;
    const parts = sources.map((part, index): EditablePart => {
      const mapping = new Map(part.questions.map(q => [q.number, next++]));
      return {...part, id: 'p' + index, position: index + 1,
        questions: part.questions.map(q => ({...q, number: mapping.get(q.number)!})),
        slots: Object.fromEntries(Object.entries(part.slots).map(([id, slot]) => [id, {...slot, numbers: slot.numbers.map(n => mapping.get(n)!)}])),
        ...Object.fromEntries((['passageHtml','questionHtml'] as const).map(field => [field, part[field].replace(/(Questions?\s+)(\d+)(\s*[-–—]\s*)(\d+)/gi, (text, word, a, dash, b) => mapping.has(+a) && mapping.has(+b) ? word + mapping.get(+a) + dash + mapping.get(+b) : text)]))};
    });
    test = {schemaVersion: 1, id: attempt.testId, title: attempt.testTitle, skill: attempt.skill, source: 'Custom Mock', access: 'free', status: 'published', duration: 0, parts, sourceSections: attempt.sourceSections, createdAt: attempt.createdAt, updatedAt: attempt.createdAt};
  } else {
    test = structuredClone(await get(attempt.testId));
    if (attempt.sectionIds?.length) {
      test.parts = test.parts.filter(p => attempt.sectionIds!.includes(p.id));
      if (test.parts.length !== attempt.sectionIds.length) throw Error('A part from this attempt is no longer available.');
      test.sectionIds = attempt.sectionIds;
      test.sourceTestId = attempt.testId;
    }
    test.title = attempt.testTitle;
  }
  const current = test.parts.flatMap(p => p.questions.map(q => q.number)).sort((a, b) => a - b);
  const saved = attempt.result.rows.map(r => r.number).sort((a, b) => a - b);
  if (!current.length || JSON.stringify(current) !== JSON.stringify(saved)) throw Error('The test questions have changed since this attempt. Your saved answers and score remain available on the result page.');
  return test;
}
export function savedReviewKeys(attempt: AttemptRecord | undefined, keys: Record<number, any>) {
  if (!attempt) return keys;
  return Object.fromEntries(attempt.result.rows.map(row => [row.number, {...keys[row.number], answer: row.answer}]));
}
