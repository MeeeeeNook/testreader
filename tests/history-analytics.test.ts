import type {AttemptRecord, EditableTest, UserProfile, ScoreRow} from '../src/types';
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProgressView } from "../src/components/ProgressView";
import { summarize, breakdown, filterHistory, progressChange, studyActivity, attemptScope, typeLabel, testSummaries } from "../src/services/historyAnalytics";
import { attemptReviewPath, loadAttemptDefinition, savedReviewKeys } from "../src/services/attemptReview";
import { loadAssessment, markAssessment } from "../server/assessment";
const profile: any = { id: "student", target: 7, fontSize: 18 };
function attempt(id: string, statuses: Array<ScoreRow['status']>, extra: Partial<AttemptRecord> = {}): AttemptRecord {
  const rows = statuses.map((status, i) => ({ number: i + 1, response: status === "blank" ? "" : "A", answer: "B", status, kind: i % 2 ? "heading" : "true_false", part: i < 2 ? 1 : 2 }));
  return { id, owner: "student", testId: "test", testTitle: "Example", skill: "reading", mode: "practice", createdAt: 1, responses: { 1: "A" }, result: { rows, total: rows.length, correct: statuses.filter((s) => s === "correct").length, incorrect: statuses.filter((s) => s === "incorrect").length, blank: statuses.filter((s) => s === "blank").length, ungraded: statuses.filter((s) => s === "ungraded").length, gradable: statuses.filter((s) => s !== "ungraded").length }, ...extra };
}
test("weighted accuracy excludes ungraded, distinguishes blank from incorrect, and excludes missing timing", () => {
  const s = summarize([attempt("a", ["correct"], { elapsedSeconds: 10 }), attempt("b", ["incorrect", "blank", "ungraded"]), attempt("c", ["correct", "correct", "correct"], { elapsedSeconds: 90 })]);
  assert.equal(s.correct, 4);
  assert.equal(s.gradable, 6);
  assert.equal(s.accuracy, 4 / 6);
  assert.equal(s.answeredAccuracy, 4 / 5);
  assert.equal(s.completion, 5 / 6);
  assert.equal(s.totalSeconds, 100);
  assert.equal(s.timedSessions, 2);
  assert.equal(s.averageSeconds, 50);
  assert.equal(s.medianSeconds, 50);
  assert.equal(s.secondsPerQuestion, 25);
  assert.equal(summarize([]).accuracy, null);
  assert.equal(summarize([attempt("x", ["ungraded"])]).answeredAccuracy, null);
  assert.equal(summarize([attempt("x", ["correct"], { elapsedSeconds: -1 })]).timedSessions, 0);
});
test("type ranking counts incorrect plus blank and keeps skills separate", () => {
  const rows = breakdown([attempt("a", ["correct", "incorrect", "blank", "ungraded"]), attempt("b", ["incorrect"], { skill: "listening" })], "type");
  const tf = rows.find((r) => r.skill === "reading" && r.label === typeLabel("true_false"))!;
  assert.equal(tf.errors, 1);
  assert.equal(tf.gradable, 2);
  assert.equal(tf.errorRate, 0.5);
  assert.equal(rows.filter((r) => r.skill === "listening").length, 1);
  assert.equal(typeLabel("", "reading"), "Type not recorded");
  const a = attempt("a", ["incorrect"]);
  delete a.result.rows[0].kind;
  delete a.result.rows[0].part;
  assert.equal(breakdown([a], "type")[0].label, "Type not recorded");
  assert.equal(breakdown([a], "part")[0].label, "Part not recorded");
});
test("filters, per-test scopes and progress use chronological session order", () => {
  const now = Date.now(), old = attempt("old", ["incorrect"], { createdAt: now - 40 * 864e5 }), recent = attempt("new", ["correct"], { createdAt: now, elapsedSeconds: 30, mode: "exam" });
  assert.deepEqual(filterHistory([old, recent], { days: 7, skill: "reading", mode: "exam", test: "", search: "example" }, now).map((a) => a.id), ["new"]);
  assert.equal(progressChange([recent, old])!.difference, 100);
  assert.equal(testSummaries([recent, old])[0].change, 100);
  assert.notEqual(attemptScope(recent), attemptScope({ ...recent, sectionIds: ["p1"] }));
  assert.equal(attemptScope({ ...recent, sectionIds: ["b", "a"] }), attemptScope({ ...recent, sectionIds: ["a", "b"] }));
  assert.notEqual(attemptScope({ ...recent, sourceSections: [{ testId: "x", sectionId: "a" }, { testId: "x", sectionId: "b" }] }), attemptScope({ ...recent, sourceSections: [{ testId: "x", sectionId: "b" }, { testId: "x", sectionId: "a" }] }));
});
test("activity deduplicates study days and handles a streak ending yesterday", () => {
  const now = new Date(2026, 9, 25, 12).getTime(), day = 864e5;
  const s = studyActivity([attempt("a", [], { createdAt: now - day }), attempt("b", [], { createdAt: now - day - 1e3 }), attempt("c", [], { createdAt: now - 2 * day })], now);
  assert.equal(s.activeDays, 2);
  assert.equal(s.streak, 2);
});
test("Open this test is a native new-tab link to the exact attempt, also for admin and custom mocks", () => {
  const a = attempt("a b", ["incorrect"], { sourceSections: [{ testId: "test", sectionId: "p0" }] });
  for (const admin of [false, true]) {
    const prefix = admin ? "/admin/students/student/attempts/" : "/history/";
    const html = renderToStaticMarkup(/* @__PURE__ */ React.createElement(ProgressView, { attempts: [a], profile, selectedAttemptId: a.id, readOnly: admin, getAttemptPath: (id: string) => prefix + encodeURIComponent(id), onSelectAttempt: () => {
    }, onBack: () => {
    }, onOpenProfileModal: () => {
    } }));
    assert.ok(html.includes('href="' + prefix + 'a%20b?view=review" target="_blank" rel="noopener noreferrer"'));
    assert.match(html, /Open this test/);
    assert.match(html, /Question type breakdown/);
    assert.ok(!html.includes('href="/tests/'));
  }
  assert.equal(attemptReviewPath("a b"), "/history/a%20b?view=review");
});
function testDefinition(id = "test"): EditableTest {
  return { id, title: id, skill: "reading", schemaVersion: 1, source: "", access: "free", status: "published", duration: 60, createdAt: 1, updatedAt: 1, parts: [{ id: "p0", title: "First", passageHtml: "<p>Text</p>", questionHtml: '<p>Questions 10\u201311</p><span data-slot="s"></span>', slots: { s: { id: "s", numbers: [10, 11], type: "multi", label: "", options: [] } }, questions: [{ number: 10, kind: "multiple_choice", answer: "B" }, { number: 11, kind: "multiple_choice", answer: "C" }] }, { id: "p1", title: "Second", passageHtml: "Text", questionHtml: "", slots: { s: { id: "s", numbers: [12], type: "text", label: "", options: [] } }, questions: [{ number: 12, kind: "sentence", answer: "word" }] }] };
}
test("review restores selected parts and custom ordering without changing original definitions", async () => {
  const full = testDefinition(), a = attempt("a", ["incorrect", "blank"]);
  a.result.rows[0].number = 10;
  a.result.rows[1].number = 11;
  a.sectionIds = ["p0"];
  const chosen = await loadAttemptDefinition(a, async () => full);
  assert.equal(chosen.parts.length, 1);
  assert.equal(full.parts.length, 2);
  const mock = attempt("mock", ["correct", "incorrect", "blank"], { sourceSections: [{ testId: "test", sectionId: "p1" }, { testId: "test", sectionId: "p0" }] });
  let reads = 0;
  const result = await loadAttemptDefinition(mock, async () => {
    reads++;
    return full;
  });
  assert.equal(reads, 1);
  assert.equal(result.parts[0].id, "p0");
  assert.equal(result.parts[0].questions[0].number, 1);
  assert.deepEqual(result.parts[1].slots.s.numbers, [2, 3]);
  assert.match(result.parts[1].questionHtml, /Questions 2–3/);
  assert.equal(full.parts[1].questions[0].number, 12);
  await assert.rejects(loadAttemptDefinition(attempt("bad", ["correct"]), async () => full), /changed/);
  const keys = savedReviewKeys(a, { 10: { answer: "Changed", explanationHtml: "Explanation" } });
  assert.equal(keys[10].answer, "B");
  assert.equal(keys[10].explanationHtml, "Explanation");
});
test("server grading attaches trusted type and part metadata including custom renumbering", async () => {
  const full = testDefinition(), store = { test: async () => ({ title: "Test", skill: "reading", status: "published" }), sections: async () => full.parts.map((p, index) => ({ ...p, index })), keys: async () => ({ keys: { 10: { answer: "B", kind: "multiple_choice" }, 11: { answer: "C" }, 12: { answer: "word" } } }) };
  const assessment = await loadAssessment(store, { testId: "test", sectionIds: ["p1"] }, false);
  const marked = markAssessment(assessment, { 12: "word" });
  assert.equal(marked.result.rows[0].kind, "sentence");
  assert.equal(marked.result.rows[0].part, 2);
  assert.equal(marked.result.rows[0].partTitle, "Second");
  const mock = await loadAssessment(store, { sourceSections: [{ testId: "test", sectionId: "p1" }, { testId: "test", sectionId: "p0" }] }, false);
  assert.equal(markAssessment(mock, { 1: "word" }).result.rows[0].part, 1);
});
test("dashboard renders all-time analytics and accessible filters for a mix of sessions", () => {
  const html = renderToStaticMarkup(/* @__PURE__ */ React.createElement(ProgressView, { attempts: [attempt("a", ["correct"], { elapsedSeconds: 10 }), attempt("b", ["incorrect", "blank"], { skill: "listening" })], profile, onSelectAttempt: () => {
  }, onBack: () => {
  }, onOpenProfileModal: () => {
  } }));
  for (const label of ["History skill", "History mode", "History period", "History test", "Recorded study time", "Answered accuracy", "By test", "Recent accuracy", "Study habits"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("NaN"));
});
