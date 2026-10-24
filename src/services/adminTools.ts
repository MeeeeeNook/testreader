import type {TestMeta, UserProfile} from '../types';

export function csvText(rows: unknown[][]): string {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n');
}
export function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([csvText(rows)], {type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function studentDirectory(learners: UserProfile[], search: string, status: string, sort: string, upcoming = false, now = Date.now()) {
  const today = new Date(now); today.setHours(0,0,0,0);
  const end = new Date(today); end.setDate(end.getDate()+30);
  return learners.filter(l => {
    if (l.deletedAt || (status && l.status !== status)) return false;
    if (!(l.name+' '+l.email+' '+l.id).toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (upcoming) { const exam = new Date(l.examDate ? l.examDate+'T00:00:00' : '').getTime(); if (!(exam >= today.getTime() && exam <= end.getTime())) return false; }
    return true;
  }).sort((a,b) => sort === 'name' ? (a.name || a.email).localeCompare(b.name || b.email) : sort === 'target' ? (b.target || 0)-(a.target || 0) : sort === 'updated' ? (b.updatedAt || 0)-(a.updatedAt || 0) : (b.createdAt || 0)-(a.createdAt || 0));
}
export function adminSearch(tests: TestMeta[], learners: UserProfile[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return [
    ...tests.filter(t => !t.deletedAt && (t.title+' '+t.skill).toLowerCase().includes(q)).slice(0,8).map(t => ({id:'test:'+t.id,title:t.title,detail:t.skill+' · '+t.status,href:'/admin/tests/'+encodeURIComponent(t.id)})),
    ...learners.filter(l => !l.deletedAt && (l.name+' '+l.email).toLowerCase().includes(q)).slice(0,8).map(l => ({id:'student:'+l.id,title:l.name || l.email,detail:l.email,href:'/admin/students/'+encodeURIComponent(l.id)})),
  ];
}
