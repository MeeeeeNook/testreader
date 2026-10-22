import type { TestMeta, AttemptRecord } from '../types';
export const sortOptions = [
  ['new', 'Newest added'], ['old', 'Oldest added'], ['updated', 'Recently updated'],
  ['title', 'Title A–Z'], ['title-desc', 'Title Z–A'], ['source', 'Folder A–Z'],
  ['questions', 'Most questions'], ['questions-asc', 'Fewest questions'],
  ['duration', 'Shortest duration'], ['duration-desc', 'Longest duration'],
] as const;
export const folderPath = (value: string) => value.split(/[\\/]/).map(s => s.trim()).filter(Boolean).join(' / ');
export const inFolder = (value: string, folder: string, recursive = true) => {
  const path = folderPath(value), target = folderPath(folder);
  return !target || path === target || (recursive && path.startsWith(target + ' / '));
};
export function folderChildren(tests: TestMeta[], parent = '') {
  const prefix = folderPath(parent);
  const result = new Map<string, number>();
  for (const test of tests) {
    const path = folderPath(test.source || 'Unfiled');
    if (prefix && !path.startsWith(prefix + ' / ')) continue;
    const tail = prefix ? path.slice(prefix.length + 3) : path;
    const child = (prefix ? prefix + ' / ' : '') + tail.split(' / ')[0];
    result.set(child, (result.get(child) || 0) + 1);
  }
  return [...result].sort(([a], [b]) => a.localeCompare(b, undefined, {numeric: true}));
}
export function compareTests(a: TestMeta, b: TestMeta, sort: string) {
  const title = a.title.localeCompare(b.title, undefined, {numeric: true});
  let order = 0;
  switch (sort) {
    case 'old': order = (a.createdAt || a.updatedAt) - (b.createdAt || b.updatedAt); break;
    case 'new': order = (b.createdAt || b.updatedAt) - (a.createdAt || a.updatedAt); break;
    case 'updated': order = b.updatedAt - a.updatedAt; break;
    case 'title': order = title; break;
    case 'title-desc': order = -title; break;
    case 'source': order = folderPath(a.source).localeCompare(folderPath(b.source), undefined, {numeric: true}); break;
    case 'questions': order = b.questions - a.questions; break;
    case 'questions-asc': order = a.questions - b.questions; break;
    case 'duration': order = a.duration - b.duration; break;
    case 'duration-desc': order = b.duration - a.duration; break;
  }
  return order || title || a.id.localeCompare(b.id);
}
export function latestAttempt(attempts: AttemptRecord[], testId: string) {
  return attempts.filter(a => a.testId === testId).reduce((time, a) => Math.max(time, a.createdAt), 0);
}
export function allFolderPaths(tests: TestMeta[]) {
  const paths = new Set<string>();
  for (const test of tests) {
    const segments = folderPath(test.source || 'Unfiled').split(' / ');
    segments.forEach((_, i) => paths.add(segments.slice(0, i + 1).join(' / ')));
  }
  return [...paths].sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
}

export function planFolderMove(tests: TestMeta[], from: string, to: string) {
  const source = folderPath(from), destination = folderPath(to);
  if (!source || !destination) throw new Error('Choose a source and destination folder.');
  const groups = new Map<string, string[]>();
  for (const test of tests.filter(t => !t.deletedAt && inFolder(t.source || 'Unfiled', source))) {
    const suffix = folderPath(test.source || 'Unfiled').slice(source.length);
    const target = destination + suffix;
    groups.set(target, [...(groups.get(target) || []), test.id]);
  }
  return groups;
}


export function planFolderDeletion(tests: TestMeta[], selected: string[]) {
 const paths=[...new Set(selected.map(folderPath).filter(Boolean))];
 const roots=paths.filter(p=>!paths.some(other=>other!==p&&inFolder(p,other)));
 const affected=tests.filter(t=>!t.deletedAt&&roots.some(p=>inFolder(t.source||"Unfiled",p)));
 return {folders:roots,ids:[...new Set(affected.map(t=>t.id))]};
}
