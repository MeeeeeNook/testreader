/**
 * Deterministic IELTS Practice & Exam Marking Engine.
 * Only exact variants present in the source key count (case/whitespace insensitive).
 */

export interface QuestionKey {
  missing?: boolean;
  answer: string;
  kind?: string;
  explanationHtml?: string;
  referenceQuote?: string;
}

export interface ScoreRow {
  number: number;
  response: string;
  answer: string;
  status: 'correct' | 'incorrect' | 'blank' | 'ungraded';
}

export interface ScoreResult {
  rows: ScoreRow[];
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  ungraded: number;
  gradable: number;
}

export function normalizeAnswer(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function answerMatches(response: string, key: QuestionKey): boolean {
  const value = normalizeAnswer(response);
  if (!value) return false;
  return String(key.answer || '')
    .split('||')
    .some((variant) => {
      const answer = normalizeAnswer(variant);
      if (['matching_features', 'matching_names', 'heading'].includes(key.kind || '')) {
        const letter = /^([a-z]|[ivxlcdm]+)(?:\s*[.\-—–•·]\s*|\s+|$)/i.exec(answer);
        if (letter && value === letter[1].toLowerCase()) return true;
      }
      return value === answer;
    });
}

export interface ScoringPart {
  numbers: number[];
  keys: Map<number, QuestionKey> | Record<number, QuestionKey>;
  missing?: Set<number> | number[];
  multiGroups?: number[][];
}

export function scoreTest(
  parts: ScoringPart[],
  responses: Record<string | number, string>
): ScoreResult {
  const rows = new Map<number, ScoreRow>();

  for (const part of parts) {
    const isMap = part.keys instanceof Map;
    const getKey = (n: number): QuestionKey =>
      (isMap ? (part.keys as Map<number, QuestionKey>).get(n) : (part.keys as Record<number, QuestionKey>)[n]) || { answer: '' };

    const missingSet = part.missing instanceof Set ? part.missing : new Set(part.missing || []);

    for (const n of part.numbers) {
      const key = getKey(n);
      const response = String(responses[n] || '');
      const status: ScoreRow['status'] =
        missingSet.has(n) || key.missing || !key.answer
          ? 'ungraded'
          : !normalizeAnswer(response)
          ? 'blank'
          : answerMatches(response, key)
          ? 'correct'
          : 'incorrect';

      rows.set(n, {
        number: n,
        response,
        answer: key.answer || '',
        status,
      });
    }

    for (const group of part.multiGroups || []) {
      if (group.some((n) => rows.get(n)?.status === 'ungraded')) {
        for (const n of group) {
          if (rows.has(n)) rows.get(n)!.status = 'ungraded';
        }
        continue;
      }

      const remaining = group.map((n) => ({ ...getKey(n) }));
      for (const n of group) {
        const row = rows.get(n);
        if (!row) continue;
        if (!normalizeAnswer(row.response)) {
          row.status = 'blank';
          continue;
        }
        const index = remaining.findIndex((k) => answerMatches(row.response, k));
        row.status = index < 0 ? 'incorrect' : 'correct';
        if (index >= 0) {
          row.answer = remaining.splice(index, 1)[0].answer;
        }
      }
    }
  }

  const sortedRows = Array.from(rows.values()).sort((a, b) => a.number - b.number);
  const result: ScoreResult = {
    rows: sortedRows,
    total: sortedRows.length,
    correct: 0,
    incorrect: 0,
    blank: 0,
    ungraded: 0,
    gradable: 0,
  };

  for (const row of result.rows) {
    result[row.status]++;
  }
  result.gradable = result.total - result.ungraded;
  return result;
}

export function estimatedBand(result: ScoreResult, skill: 'reading' | 'listening' = 'reading'): number | null {
  if (result.total !== 40 || result.ungraded > 0) return null;
  // Listening thresholds: https://ielts.idp.com/vietnam/results/scores/listening/en-gb/
  const bounds: [number, number][] = skill === 'listening' ? [
    [39,9],[37,8.5],[35,8],[32,7.5],[30,7],[26,6.5],[23,6],[18,5.5],
    [16,5],[13,4.5],[10,4],[8,3.5],[6,3],[4,2.5],[3,2],[2,1.5],[1,1],[0,0],
  ] : [
    [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5],
    [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5],
    [6, 3], [4, 2.5], [3, 2], [2, 1.5], [1, 1], [0, 0],
  ];
  const match = bounds.find(([threshold]) => result.correct >= threshold);
  return match ? match[1] : null;
}

