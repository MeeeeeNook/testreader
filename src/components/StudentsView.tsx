import React, { useEffect, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import type { AttemptRecord, UserProfile } from "../types";
import { mergeAttempts } from "../services/localHistory.js";
import { firestoreAdapter } from "../services/firestoreAdapter";
import { ProgressView } from "./ProgressView";
interface Props {
  learners: UserProfile[];
  studentId?: string;
  attemptId?: string;
  onNavigate: (path: string) => void;
}
export function StudentsView({
  learners,
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
  if (studentId)
    return (
      <section className="students-page">
        <button className="text-link" onClick={() => onNavigate(root)}>
          ← All students
        </button>
        <div className="studio-page-head">
          <div>
            <div className="studio-eyebrow">STUDENT PROFILE</div>
            <h1 className="studio-heading">
              {student?.name || "Student history"}
            </h1>
            <p>{student?.email || studentId}</p>
          </div>
          <button
            className="studio-secondary"
            disabled={loading}
            onClick={() => void load(true)}
          >
            Refresh history
          </button>
        </div>
        <p className="studio-callout">
          Only attempts synced to the student’s account appear here. Guest
          attempts remain on their device until they sign in.
        </p>
        {error && (
          <div role="alert" className="studio-callout">
            {error}
            <button onClick={() => void load(true)}>Retry</button>
          </div>
        )}
        {loading && <p role="status">Loading attempts…</p>}
        {!loading && (
          <ProgressView
            attempts={attempts}
            profile={
              student || {
                id: studentId,
                email: "",
                name: "Student",
                target: 7,
                language: "en",
                theme: "light",
                fontSize: 18,
                favorites: [],
                status: "active",
              }
            }
            selectedAttemptId={attemptId}
            readOnly
            getAttemptPath={(id) =>
              `${root}/${encodeURIComponent(studentId)}/attempts/${encodeURIComponent(id)}`
            }
            onSelectAttempt={(id) =>
              onNavigate(
                `${root}/${encodeURIComponent(studentId)}/attempts/${encodeURIComponent(id)}`,
              )
            }
            onBack={() =>
              onNavigate(`${root}/${encodeURIComponent(studentId)}`)
            }
            onOpenProfileModal={() => {}}
            onReopenAttempt={(a) =>
              onNavigate(`/tests/${encodeURIComponent(a.testId)}`)
            }
          />
        )}{" "}
        {hasMore && !attemptId && (
          <button
            className="studio-secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            Load older attempts
          </button>
        )}
      </section>
    );
  return (
    <section className="students-page">
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">TEACHER WORKSPACE</div>
          <h1 className="studio-heading">Your students.</h1>
          <p className="studio-lead">
            Open a student to see their synced sessions, scores, and answers.
          </p>
        </div>
      </div>
      <label className="studio-field">
        Search students
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or email"
        />
      </label>
      <div className="student-grid">
        {learners
          .filter((l) =>
            `${l.name} ${l.email}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((l) => (
            <article className="studio-panel" key={l.id}>
              <div className="studio-avatar">
                {(l.name || l.email || "?").slice(0, 2).toUpperCase()}
              </div>
              <h2>{l.name || "Student"}</h2>
              <p>{l.email}</p>
              <small>
                Target band {l.target} · {l.status}
              </small>
              <div>
                <button
                  className="studio-primary"
                  onClick={() =>
                    onNavigate(`${root}/${encodeURIComponent(l.id)}`)
                  }
                >
                  View attempts →
                </button>
              </div>
            </article>
          ))}
      </div>
      {!learners.length && (
        <div className="studio-empty">
          Students appear here after signing in to the app.
        </div>
      )}
    </section>
  );
}
