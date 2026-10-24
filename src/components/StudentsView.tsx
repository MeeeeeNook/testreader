import {downloadCsv,studentDirectory} from '../services/adminTools';
import {HistoryAnalytics} from './HistoryAnalytics';
import {ConfirmActionDialog} from './ConfirmActionDialog';
import {PaginatedTable} from './PaginatedTable';
import {Modal} from './Modal';
import {auth} from '../firebase';
import {requestJson} from '../services/apiRequest';
import React, { useEffect, useRef, useState } from "react";
import type { AttemptRecord, UserProfile } from "../types";
import { mergeAttempts } from "../services/localHistory.js";
import { firestoreAdapter } from "../services/firestoreAdapter";
import { ProgressView } from "./ProgressView";
interface Props {
  learners: UserProfile[];
  onToggleStatus:(uid:string,status:"active"|"suspended")=>Promise<void>;
  onDeleted:(uid:string)=>void;
  studentId?: string;
  attemptId?: string;
  review?: boolean;
  onNavigate: (path: string) => void;
}
export function StudentsView({
  learners, onToggleStatus,onDeleted,
  studentId,
  attemptId,
  review,
  onNavigate,
}: Props) {
  const [search, setSearch] = useState("");
  const [sort,setSort]=useState('newest'),[upcoming,setUpcoming]=useState(false),[confirmStatus,setConfirmStatus]=useState(false);
  const [historySearch,setHistorySearch]=useState(''),[historySkill,setHistorySkill]=useState(''),[historyMode,setHistoryMode]=useState('');


  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [hasMore, setHasMore] = useState(false);
  const cursor = useRef<{createdAt:number;id:string} | undefined>(undefined);
  const active = useRef(studentId);
  active.current = studentId;
  const student = learners.find((l) => l.id === studentId);
  const load = async (reset = false) => {
    if (!studentId) return;
    const uid = studentId;
    setLoading(true);
    setError("");
    try {
      const page = await firestoreAdapter.listStudentAttempts(
        uid,
        reset ? undefined : cursor.current,
      );
      if (active.current !== uid) return;
      setAttempts((previous) =>
        reset
          ? mergeAttempts(
              page.attempts,
              previous.filter((a) => a.id === attemptId),
            )
          : mergeAttempts(previous, page.attempts),
      );
      cursor.current = page.cursor||undefined;
      setHasMore(page.hasMore);
    } catch (e) {
      if (active.current === uid)
        setError(
          e instanceof Error ? e.message : "Could not load student attempts.",
        );
    } finally {
      if (active.current === uid) setLoading(false);
    }
  };
  useEffect(() => {
    setAttempts([]);
    cursor.current = undefined;
    setHasMore(false);
    if (studentId) void load(true);
  }, [studentId]);
  const root = "/admin/students";
  useEffect(() => {
    if (!studentId || !attemptId) return;
    let alive = true;
    void firestoreAdapter
      .getStudentAttempt(studentId, attemptId)
      .then((record) => {
        if (alive && record)
          setAttempts((previous) => [
            ...previous.filter((a) => a.id !== record.id),
            record as AttemptRecord,
          ]);
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error ? e.message : "Could not load this result.",
          );
      });
    return () => {
      alive = false;
    };
  }, [studentId, attemptId]);

  const [account,setAccount]=useState<any>(null),[accountError,setAccountError]=useState(''),[accountRetry,setAccountRetry]=useState(0),[actionBusy,setActionBusy]=useState(false),[confirmDelete,setConfirmDelete]=useState(false),[confirmEmail,setConfirmEmail]=useState(''),[statusFilter,setStatusFilter]=useState('');
  useEffect(()=>{setConfirmStatus(false);setConfirmDelete(false);setConfirmEmail('');setHistorySearch('');setHistorySkill('');setHistoryMode('');},[studentId]);
  useEffect(()=>{setAccount(null);setAccountError('');if(!studentId)return;let alive=true;void requestJson('/api/admin/student-details',{targetUserId:studentId},()=>auth.currentUser).then(data=>{if(alive)setAccount(data)}).catch(e=>{if(alive)setAccountError(e.message)});return()=>{alive=false}},[studentId,accountRetry]);
  const date=(value?:number)=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not recorded';
  const duration=(value?:number)=>Number.isFinite(value)?Math.floor(value!/60)+'m '+Math.floor(value!%60)+'s':'Not recorded';
  const mode=(value:unknown)=>value==='exam'?'Test':value==='practice'?'Practice':'Not recorded';
  const protectedAccount=studentId===auth.currentUser?.uid||student?.email==='manhcuong2006ht@gmail.com';
  const action=async(task:()=>Promise<void>)=>{setActionBusy(true);setAccountError('');try{await task()}catch(e){setAccountError((e as Error).message)}finally{setActionBusy(false)}};
  const shownAttempts=attempts.filter(a=>(!historySkill||a.skill===historySkill)&&(!historyMode||a.mode===historyMode)&&a.testTitle.toLowerCase().includes(historySearch.trim().toLowerCase()));
  const followLink=(e:React.MouseEvent,href:string)=>{if(e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onNavigate(href)}};
  if(studentId)return <section className="students-page student-admin-detail">
   <button className="text-link" onClick={()=>onNavigate(root)}>← All students</button>
   <header className="studio-page-head"><div><span className="studio-eyebrow">STUDENT ADMINISTRATION</span><h1 className="studio-heading">{student?.name||account?.email||'Student account'}</h1><p>{student?.email||account?.email||studentId}</p></div><button className="studio-secondary" disabled={loading} onClick={()=>{void load(true);setAccountRetry(i=>i+1)}}>Refresh</button></header>
   {accountError&&<p role="alert" className="studio-callout">{accountError}</p>}
   <section className="studio-panel"><div className="studio-heading-line"><h2>Account details</h2><span className="studio-tag">{student?.status||'Unknown status'}</span></div><dl className="student-detail-grid"><div><dt>Account created</dt><dd>{date(account?.createdAt||student?.createdAt)}</dd></div><div><dt>Last sign-in</dt><dd>{date(account?.lastSignInAt)}</dd></div><div><dt>Email verified</dt><dd>{account?account.emailVerified?'Yes':'No':'Loading…'}</dd></div><div><dt>Sign-in provider</dt><dd>{account?.providers?.join(', ')||'Loading…'}</dd></div><div><dt>Target band</dt><dd>{student?.target??'Not set'}</dd></div><div><dt>Exam date</dt><dd>{student?.examDate||'Not set'}</dd></div><div><dt>Profile updated</dt><dd>{date(student?.updatedAt)}</dd></div><div><dt>Account ID</dt><dd>{studentId}</dd></div></dl>
   {!protectedAccount&&<div className="studio-actions"><button disabled={actionBusy} className="studio-secondary" onClick={()=>setConfirmStatus(true)}>{student?.status==='suspended'?'Activate account':'Suspend account'}</button><button disabled={actionBusy||!account?.email} className="studio-secondary studio-danger" onClick={()=>{setConfirmEmail('');setConfirmDelete(true)}}>Delete account</button></div>}</section>
   {confirmStatus&&<ConfirmActionDialog title={student?.status==='suspended'?'Activate account?':'Suspend account?'} confirmLabel={student?.status==='suspended'?'Activate account':'Suspend account'} onCancel={()=>setConfirmStatus(false)} onConfirm={()=>{setConfirmStatus(false);void action(()=>onToggleStatus(studentId,student?.status==='suspended'?'active':'suspended'))}}>This changes access for {student?.email||account?.email}. Saved attempts are kept.</ConfirmActionDialog>}
   {confirmDelete&&<Modal label="Delete student account" onClose={()=>{if(!actionBusy)setConfirmDelete(false)}}><h2>Delete this account permanently?</h2><p>This removes the sign-in account, saved test history and vocabulary. A minimal access block is kept to prevent an old session from recreating the account. This cannot be undone.</p><label className="studio-field">Type {account?.email} to confirm<input autoComplete="off" value={confirmEmail} onChange={e=>setConfirmEmail(e.target.value)}/></label><div className="studio-actions"><button disabled={actionBusy} onClick={()=>setConfirmDelete(false)} className="studio-secondary">Cancel</button><button className="studio-primary" disabled={actionBusy||confirmEmail!==account?.email} onClick={()=>void action(async()=>{await requestJson('/api/admin/student-delete',{targetUserId:studentId,confirmEmail},()=>auth.currentUser);setConfirmDelete(false);onDeleted(studentId);onNavigate(root)})}>{actionBusy?'Deleting…':'Permanently delete'}</button></div>{accountError&&<p role="alert">{accountError}</p>}</Modal>}
   {error&&<p role="alert">{error}<button onClick={()=>void load(true)}>Retry history</button></p>}
   {attemptId?<ProgressView attempts={attempts} profile={student||{id:studentId,email:'',name:'Student',target:7,language:'en',theme:'light',fontSize:18,favorites:[],status:'active'}} selectedAttemptId={attemptId} review={review} readOnly getAttemptPath={id=>root+'/'+encodeURIComponent(studentId)+'/attempts/'+encodeURIComponent(id)} onSelectAttempt={id=>onNavigate(root+'/'+encodeURIComponent(studentId)+'/attempts/'+encodeURIComponent(id))} onBack={()=>onNavigate(root+'/'+encodeURIComponent(studentId))} onOpenProfileModal={()=>{}} onReopenAttempt={a=>onNavigate('/tests/'+encodeURIComponent(a.testId))}/>:<section className="studio-panel"><div className="admin-section-heading"><div><h2>Synced test history</h2><p className="studio-small">{attempts.length} sessions loaded{hasMore?' · Older sessions available':''}</p></div><button className="studio-secondary" disabled={!shownAttempts.length} onClick={()=>downloadCsv('student-attempts.csv',[['Test','Skill','Mode','Completed','Correct','Gradable','Band','Time (seconds)'],...shownAttempts.map(a=>[a.testTitle,a.skill,a.mode,date(a.completedAt||a.createdAt),a.result.correct,a.result.gradable,a.band,a.elapsedSeconds])])}>Export filtered CSV</button></div>
   <div className="admin-filters"><label>Find a session<input value={historySearch} onChange={e=>setHistorySearch(e.target.value)} placeholder="Test title"/></label><label>Skill<select value={historySkill} onChange={e=>setHistorySkill(e.target.value)}><option value="">All skills</option><option value="reading">Reading</option><option value="listening">Listening</option></select></label><label>Mode<select value={historyMode} onChange={e=>setHistoryMode(e.target.value)}><option value="">All modes</option><option value="exam">Test</option><option value="practice">Practice</option></select></label></div>
   <details className="admin-student-analytics"><summary>Performance insights · {shownAttempts.length} matching sessions</summary><p className="studio-small">Based on loaded, filtered sessions only. Load older sessions below for a fuller picture.</p><HistoryAnalytics attempts={shownAttempts} getAttemptPath={id=>root+'/'+encodeURIComponent(studentId)+'/attempts/'+encodeURIComponent(id)}/></details>
   <PaginatedTable key={[studentId,historySearch,historySkill,historyMode].join(':')}><thead><tr><th>Completed</th><th>Test</th><th>Skill</th><th>Mode</th><th>Time spent</th><th>Score</th><th>Band</th><th>Actions</th></tr></thead><tbody>{shownAttempts.map(a=><tr key={a.id}><td>{date(a.completedAt||a.createdAt)}</td><td>{a.testTitle}</td><td>{a.skill}</td><td>{mode(a.mode)}</td><td>{duration(a.elapsedSeconds)}</td><td>{a.result.correct}/{a.result.gradable}<small className="studio-small" style={{display:'block'}}>{a.serverVerified?'Server verified':'Legacy · not verified'}</small></td><td>{a.band?.toFixed(1)??'—'}</td><td><a className="admin-test-link" href={root+'/'+encodeURIComponent(studentId)+'/attempts/'+encodeURIComponent(a.id)+'?view=review'} target="_blank" rel="noopener noreferrer">Review answers ↗</a></td></tr>)}</tbody></PaginatedTable>{loading&&<p role="status">Loading history…</p>}{hasMore&&<button disabled={loading} className="studio-secondary" onClick={()=>void load()}>Load older sessions</button>}<p className="studio-small">Only sessions saved to this account are shown.</p></section>}
  </section>;
  const visible=studentDirectory(learners,search,statusFilter,sort,upcoming);
  const live=learners.filter(l=>!l.deletedAt);
  return <section className="students-page">
    <header className="studio-page-head"><div><span className="studio-eyebrow">PEOPLE & PROGRESS</span><h1 className="studio-heading">Students</h1><p className="studio-lead">Find a learner, review progress and manage account access.</p></div><button className="studio-secondary" disabled={!visible.length} onClick={()=>downloadCsv('students.csv',[['Name','Email','Status','Target band','Exam date','Created'],...visible.map(l=>[l.name,l.email,l.status,l.target,l.examDate,date(l.createdAt)])])}>Export filtered CSV</button></header>
    <div className="admin-metrics"><div><span>Total students</span><strong>{live.length}</strong><small>Registered accounts</small></div><div><span>Active</span><strong>{live.filter(l=>l.status==='active').length}</strong><small>Can access their learning account</small></div><div><span>Suspended</span><strong>{live.filter(l=>l.status==='suspended').length}</strong><small>Access currently paused</small></div><div><span>Exams coming up</span><strong>{studentDirectory(live,'','','newest',true).length}</strong><small>Within the next 30 days</small></div></div>
    <section className="studio-panel">
    <div className="admin-student-filters"><label>Find a student<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, email or account ID"/></label><label>Account status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest accounts</option><option value="name">Name A–Z</option><option value="updated">Recently updated</option><option value="target">Highest target band</option></select></label></div>
    <div className="admin-list-tools"><label><input type="checkbox" checked={upcoming} onChange={e=>setUpcoming(e.target.checked)}/> Exam in next 30 days</label><span role="status">{visible.length} students</span><button className="studio-quiet" onClick={()=>{setSearch('');setStatusFilter('');setUpcoming(false);setSort('newest')}}>Reset filters</button></div>
    <PaginatedTable key={[search,statusFilter,sort,upcoming].join(':')}><thead><tr><th>Student</th><th>Target band</th><th>Exam date</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{visible.map(l=><tr key={l.id}><td><a className="admin-person" href={root+'/'+encodeURIComponent(l.id)} onClick={e=>followLink(e,root+'/'+encodeURIComponent(l.id))}><span className="admin-avatar">{(l.name||l.email||'?').slice(0,2).toUpperCase()}</span><span><strong>{l.name||'Unnamed student'}</strong><small>{l.email}</small></span></a></td><td><strong>{l.target||'Not set'}</strong></td><td>{l.examDate||'Not set'}</td><td><span className={'admin-status '+l.status}>{l.status}</span></td><td>{l.createdAt?new Date(l.createdAt).toLocaleDateString():'Not recorded'}</td><td><a className="admin-test-link" href={root+'/'+encodeURIComponent(l.id)} onClick={e=>followLink(e,root+'/'+encodeURIComponent(l.id))}>View profile →</a></td></tr>)}</tbody></PaginatedTable>
    {!visible.length&&<div className="studio-empty"><h3>No students found</h3><p>Try another name, email or filter.</p></div>}</section>
  </section>;
}
