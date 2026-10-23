import { scoreTest, estimatedBand, type QuestionKey, type ScoringPart } from '../src/services/scoring.ts';

export interface AssessmentStore {
  test: (id: string) => Promise<any>;
  sections: (id: string) => Promise<any[]>;
  keys: (id: string) => Promise<any>;
}
export class AssessmentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,128}$/.test(id);

// Load every key and group from trusted storage, including section-only and custom mock sessions.
export async function loadAssessment(store: AssessmentStore, request: any, admin: boolean) {
  const custom = request.sourceSections !== undefined;
  if (custom && (!Array.isArray(request.sourceSections) || !request.sourceSections.length || request.sourceSections.length > 4)) {
    throw new AssessmentError(400, 'Choose between one and four source sections.');
  }
  const sources: { testId: string; sectionId?: string }[] = custom ? request.sourceSections : [{ testId: request.testId }];
  const cache = new Map<string, { meta: any; sections: any[]; keyData: any }>();
  const keys: Record<number, QuestionKey & { missing?: boolean }> = {};
  const parts: ScoringPart[] = [];
  const transcripts:Record<string,string>={};
  const seenSections = new Set<string>();
  let next = 1;
  let skill: string | undefined;
  for (const source of sources) {
    if (!validId(source.testId) || (custom && !validId(source.sectionId))) throw new AssessmentError(400, 'Invalid test or section identifier.');
    let data = cache.get(source.testId);
    if (!data) {
      const meta = await store.test(source.testId);
      if (!meta || (!admin && meta.status !== 'published')) throw new AssessmentError(404, 'This test is unavailable.');
      const [sections, keyData] = await Promise.all([store.sections(source.testId), store.keys(source.testId)]);
      if (!keyData) throw new AssessmentError(409, 'Answer keys are missing. Ask an administrator to re-import this test.');
      data = { meta, sections: sections.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)), keyData };
      cache.set(source.testId, data);
    }
    if (skill && skill !== data.meta.skill) throw new AssessmentError(400, 'A mock must use the same test skill throughout.');
    skill = data.meta.skill;
    let selected = data.sections;
    if (custom) selected = selected.filter(p => p.id === source.sectionId);
    else if (request.sectionIds !== undefined) {
      if (!Array.isArray(request.sectionIds) || !request.sectionIds.length || request.sectionIds.some((id: unknown) => !validId(id))) throw new AssessmentError(400, 'Invalid section selection.');
      selected = selected.filter(p => request.sectionIds.includes(p.id));
      if (selected.length !== new Set(request.sectionIds).size) throw new AssessmentError(404, 'A selected section no longer exists.');
    }
    if (!selected.length) throw new AssessmentError(404, 'No questions found in the selected sections.');
    for (const section of selected) {
      const identity = source.testId + ':' + section.id;
      if (seenSections.has(identity)) throw new AssessmentError(400, 'Choose distinct source sections.');
      seenSections.add(identity);
      if(skill==='listening')transcripts[custom?'p'+parts.length:section.id]=data.keyData.transcripts?.[section.id]??section.passageHtml??'';
      const questions = section.questions || [];
      const slots = Object.values(section.slots || {}) as { numbers: number[]; type: string }[];
      if (questions.some((q: any) => !q.missing && !slots.some(s => s.numbers.includes(q.number)))) {
        throw new AssessmentError(409, 'This test has broken answer controls. Re-upload the original ZIP or HTML file to repair it.');
      }
      const mapping = new Map<number, number>();
      for (const q of questions) {
        if (!Number.isInteger(q.number) || q.number < 1 || mapping.has(q.number)) throw new AssessmentError(409, 'The test has invalid question numbers.');
        const n = custom ? next++ : q.number;
        if (keys[n]) throw new AssessmentError(409, 'The test contains duplicate question numbers.');
        mapping.set(q.number, n);
        const key = data.keyData.keys?.[q.number] || { answer: '' };
        keys[n] = { ...key, missing: Boolean(q.missing || key.missing) };
      }
      const groups = slots.filter(s => s.type === 'multi').map(s => s.numbers.map(n => mapping.get(n)!));
      if (groups.some(g => g.some(n => n === undefined))) throw new AssessmentError(409, 'A multiple-choice group is incomplete.');
      parts.push({ numbers: [...mapping.values()], keys, missing: [...mapping.values()].filter(n => keys[n].missing), multiGroups: groups });
    }
  }
  if (!parts.some(p => p.numbers.length)) throw new AssessmentError(409, 'This test has no questions.');
  const first = cache.values().next().value!;
  return { parts, keys, transcripts, title: custom ? 'Custom Mock' : first.meta.title, skill };
}

export function markAssessment(assessment: Awaited<ReturnType<typeof loadAssessment>>, responses: unknown) {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) throw new AssessmentError(400, 'Answers must be an object.');
  const clean: Record<number, string> = {};
  for (const [number, value] of Object.entries(responses)) {
    if (!/^\d+$/.test(number) || !Object.hasOwn(assessment.keys, number) || typeof value !== 'string' || value.length > 1000) {
      throw new AssessmentError(400, 'An answer is invalid or belongs to another test.');
    }
    clean[Number(number)] = value;
  }
  const result = scoreTest(assessment.parts, clean);
  return { result, band: estimatedBand(result, assessment.skill==='listening'?'listening':'reading'), responses: clean };
}
