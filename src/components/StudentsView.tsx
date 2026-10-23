import {PaginatedTable} from './PaginatedTable';
import {Modal} from './Modal';
import {auth} from '../firebase';
import {requestJson} from '../services/apiRequest';
import React, { useEffect, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
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
  onNavigate: (path: string) => void;
}
export function StudentsView({
  learners, onToggleStatus,onDeleted,
  studentId,
  attemptId,
  onNavigate,
}: Props) {
  const [search, setSearch] = useState("");
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [hasMore, setHasMore] = useState(false);
  const cursor = useRef<DocumentSnapshot | undefined>(undefined);
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
      cursor.current = page.cursor;
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
  useEffect(()=>{setAccount(null);setAccountError('');if(!studentId)return;let alive=true;void requestJson('/api/admin/student-details',{targetUserId:studentId},()=>auth.currentUser).then(data=>{if(alive)setAccount(data)}).catch(e=>{if(alive)setAccountError(e.message)});return()=>{alive=false}},[studentId,accountRetry]);
  const date=(value?:number)=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not recorded';
  const duration=(value?:number)=>Number.isFinite(value)?Math.floor(value!/60)+'m '+Math.floor(value!%60)+'s':'Not recorded';
  const mode=(value:unknown)=>value==='exam'?'Test':value==='practice'?'Practice':'Not recorded';
  const protectedAccount=studentId===auth.currentUser?.uid||student?.email==='manhcuong2006ht@gmail.com';
  const action=async(task:()=>Promise<void>)=>{setActionBusy(true);setAccountError('');try{await task()}catch(e){setAccountError((e as Error).message)}finally{setActionBusy(false)}};
  if(studentId)return <section className="students-page student-admin-detail">
   <button className="text-link" onClick={()=>onNavigate(root)}>← All students</button>
   <header className="studio-page-head"><div><span className="studio-eyebrow">STUDENT ADMINISTRATION</span><h1 className="studio-heading">{student?.name||account?.email||'Student account'}</h1><p>{student?.email||account?.email||studentId}</p></div><button className="studio-secondary" disabled={loading} onClick={()=>{void load(true);setAccountRetry(i=>i+1)}}>Refresh</button></header>
   {accountError&&<p role="alert" className="studio-callout">{accountError}</p>}
   <section className="studio-panel"><div className="studio-heading-line"><h2>Account details</h2><span className="studio-tag">{student?.status||'Unknown status'}</span></div><dl className="student-detail-grid"><div><dt>Account created</dt><dd>{date(account?.createdAt||student?.createdAt)}</dd></div><div><dt>Last sign-in</dt><dd>{date(account?.lastSignInAt)}</dd></div><div><dt>Email verified</dt><dd>{account?account.emailVerified?'Yes':'No':'Loading…'}</dd></div><div><dt>Sign-in provider</dt><dd>{account?.providers?.join(', ')||'Loading…'}</dd></div><div><dt>Target band</dt><dd>{student?.target??'Not set'}</dd></div><div><dt>Exam date</dt><dd>{student?.examDate||'Not set'}</dd></div><div><dt>Profile updated</dt><dd>{date(student?.updatedAt)}</dd></div><div><dt>Account ID</dt><dd>{studentId}</dd></div></dl>
   {!protectedAccount&&<div className="studio-actions"><button disabled={actionBusy} className="studio-secondary" onClick={()=>void action(()=>onToggleStatus(studentId,student?.status==='suspended'?'active':'suspended'))}>{student?.status==='suspended'?'Activate account':'Suspend account'}</button><button disabled={actionBusy||!account?.email} className="studio-secondary studio-danger" onClick={()=>{setConfirmEmail('');setConfirmDelete(true)}}>Delete account</button></div>}</section>
   {confirmDelete&&<Modal label="Delete student account" onClose={()=>{if(!actionBusy)setConfirmDelete(false)}}><h2>Delete this account permanently?</h2><p>This removes the sign-in account, saved test history and vocabulary. A minimal access block is kept to prevent an old session from recreating the account. This cannot be undone.</p><label className="studio-field">Type {account?.email} to confirm<input autoComplete="off" value={confirmEmail} onChange={e=>setConfirmEmail(e.target.value)}/></label><div className="studio-actions"><button disabled={actionBusy} onClick={()=>setConfirmDelete(false)} className="studio-secondary">Cancel</button><button className="studio-primary" disabled={actionBusy||confirmEmail!==account?.email} onClick={()=>void action(async()=>{await requestJson('/api/admin/student-delete',{targetUserId:studentId,confirmEmail},()=>auth.currentUser);setConfirmDelete(false);onDeleted(studentId);onNavigate(root)})}>{actionBusy?'Deleting…':'Permanently delete'}</button></div>{accountError&&<p role="alert">{accountError}</p>}</Modal>}
   {error&&<p role="alert">{error}<button onClick={()=>void load(true)}>Retry history</button></p>}
   {attemptId?<ProgressView attempts={attempts} profile={student||{id:studentId,email:'',name:'Student',target:7,language:'en',theme:'light',fontSize:18,favorites:[],status:'active'}} selectedAttemptId={attemptId} readOnly getAttemptPath={id=>root+'/'+encodeURIComponent(studentId)+'/attempts/'+encodeURIComponent(id)} onSelectAttempt={id=>onNavigate(root+'/'+encodeURIComponent(studentId)+'/attempts/'+encodeURIComponent(id))} onBack={()=>onNavigate(root+'/'+encodeURIComponent(studentId))} onOpenProfileModal={()=>{}} onReopenAttempt={a=>onNavigate('/tests/'+encodeURIComponent(a.testId))}/>:<section className="studio-panel"><h2>Synced test history</h2><PaginatedTable><thead><tr><th>Completed</th><th>Test</th><th>Skill</th><th>Mode</th><th>Time spent</th><th>Score</th><th>Band</th><th>Actions</th></tr></thead><tbody>{attempts.map(a=><tr key={a.id}><td>{date(a.completedAt||a.createdAt)}</td><td>{a.testTitle}</td><td>{a.skill}</td><td>{mode(a.mode)}</td><td>{duration(a.elapsedSeconds)}</td><td>{a.result.correct}/{a.result.gradable}</td><td>{a.band?.toFixed(1)??'—'}</td><td><button className="studio-quiet" onClick={()=>onNavigate(root+'/'+encodeURIComponent(studentId)+'/attempts/'+encodeURIComponent(a.id))}>Review answers</button></td></tr>)}</tbody></PaginatedTable>{loading&&<p role="status">Loading history…</p>}{hasMore&&<button disabled={loading} className="studio-secondary" onClick={()=>void load()}>Load older sessions</button>}<p className="studio-small">Only sessions saved to this account are shown.</p></section>}
  </section>;
  const visible=learners.filter(l=>!l.deletedAt&&(!statusFilter||l.status===statusFilter)&&((l.name||'')+' '+(l.email||'')).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  return <section className="students-page"><header className="studio-page-head"><div><span className="studio-eyebrow">STUDENT ADMINISTRATION</span><h1 className="studio-heading">Students</h1><p>Manage accounts, access and synced test history.</p></div></header><div className="admin-student-filters"><label>Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or email"/></label><label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label></div><PaginatedTable><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Target band</th><th>Status</th><th>Created</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{visible.map(l=><tr key={l.id}><td>{l.email}</td><td>{l.name||'Unnamed student'}</td><td>{l.email==='manhcuong2006ht@gmail.com'?'Owner':'Student'}</td><td>{l.target}</td><td><span className="studio-tag">{l.status}</span></td><td>{date(l.createdAt)}</td><td>{date(l.updatedAt)}</td><td><button className="studio-quiet" onClick={()=>onNavigate(root+'/'+encodeURIComponent(l.id))}>Manage account</button></td></tr>)}</tbody></PaginatedTable>{!visible.length&&<p>No matching accounts.</p>}</section>;
}
