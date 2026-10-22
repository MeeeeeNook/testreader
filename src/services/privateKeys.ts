import type { EditableTest } from '../types';

// Firestore rejects arrays of arrays. Keep each multi-choice group inside a map.
export function buildPrivateKeys(test: EditableTest, updatedAt: number) {
  const keys: Record<number, { answer: string; missing: boolean; kind: string; referenceQuote: string; explanationHtml: string }> = {};
  const multiGroups: { numbers: number[] }[] = [];
  for (const part of test.parts) {
    for (const question of part.questions) {
      keys[question.number] = {
        answer: question.answer || '',
        missing: Boolean(question.missing),
        kind: question.kind || 'fill_blank',
        referenceQuote: question.referenceQuote || '',
        explanationHtml: question.explanationHtml || '',
      };
    }
    for (const slot of Object.values(part.slots || {})) {
      if (slot.type === 'multi') multiGroups.push({ numbers: [...slot.numbers] });
    }
  }
  return { testId: test.id, keys, multiGroups, updatedAt };
}

