import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { AdminView } from "../src/components/AdminView.tsx";
import { renderToStaticMarkup } from "react-dom/server";
const testMeta = {
  id: "one",
  title: "Practice test",
  source: "Cambridge",
  skill: "reading" as const,
  status: "published" as const,
  access: "free" as const,
  duration: 60,
  passages: 3,
  questions: 40,
  updatedAt: 1,
};
const noop = () => {};
const props = {
  tests: [testMeta],
  reports: [],
  learners: [],
  adminUid: "owner",
  onUploadFiles: async () => {},
  onNewTest: noop,
  onEditTest: noop,
  onExportTest: noop,
  onArchiveToggle: noop,
  onExportBank: noop,
  onOpenUpload: noop,
  onToggleReportStatus: async () => {},
  onToggleLearnerStatus: async () => {},
  onNotify: noop,
  onDeleteTest: async (_id: string) => {},
  onRestoreTest: async (_id: string) => {},
  onSetCollection: async () => {},
  onSetStatus: async () => {},
  onViewStudents: noop,
};
test("admin offers sorting, folder filters, folder import, Trash and student attempts", () => {
  const html = renderToStaticMarkup(React.createElement(AdminView, props));
  for (const label of [
    "Sort tests",
    "All folders",
    "View student attempts",
    "Delete",
  ])
    assert.ok(html.includes(label), label);
});
test("Delete opens a visible confirmation and moves only the confirmed test to Trash", async () => {
  const { window } = parseHTML(
    '<html><body><div id="app"></div></body></html>',
  );
  Object.assign(globalThis, {
    window,
    document: window.document,
    Node: window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const deleted: string[] = [];
  const root = createRoot(document.getElementById("app")!);
  await act(async () =>
    root.render(
      React.createElement(AdminView, {
        ...props,
        onDeleteTest: async (id: string) => {
          deleted.push(id);
        },
      }),
    ),
  );
  const button = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Delete",
  )!;
  await act(async () =>
    button.dispatchEvent(new window.Event("click", { bubbles: true })),
  );
  assert.ok(document.querySelector("dialog[open]"));
  assert.deepEqual(deleted, []);
  const confirm = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Move to Trash",
  )!;
  await act(async () =>
    confirm.dispatchEvent(new window.Event("click", { bubbles: true })),
  );
  assert.deepEqual(deleted, ["one"]);
  await act(async () => root.unmount());
});

test('admin paginates large libraries and duplicates only the requested test as a draft',async()=>{
 const {window}=parseHTML('<html><body><div id="app"></div></body></html>');
 Object.assign(globalThis,{window,document:window.document,Node:window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const duplicated:string[]=[];
 const tests=Array.from({length:30},(_,i)=>({...testMeta,id:String(i),title:`Test ${i+1}`}));
 const root=createRoot(document.getElementById('app')!);
 try {
  await act(async()=>root.render(React.createElement(AdminView,{...props,tests,onDuplicateTest:async id=>{duplicated.push(id);},onRenameTest:async()=>{},onExportSelected:async()=>{}})));
  assert.equal(document.querySelectorAll('tbody tr').length,25);
  const click=async(label:string)=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label)!;assert.ok(b,label);await act(async()=>b.dispatchEvent(new window.Event('click',{bubbles:true})));};
  await click('Next →');assert.equal(document.querySelectorAll('tbody tr').length,5);
  await click('Duplicate draft');assert.equal(duplicated.length,1);assert.ok(tests.some(t=>t.id===duplicated[0]));
  await click('Rename');assert.ok(document.querySelector('dialog[aria-label="Rename test"] input'));
  await click('Cancel');assert.equal(document.querySelector('dialog'),null);
 }finally{await act(async()=>root.unmount());}
});

test('admin pages separate upload, folder navigation and the dashboard from the test bank',()=>{
 const render=(section:string)=>renderToStaticMarkup(React.createElement(AdminView,{...props,section,onNavigate:()=>{}}));
 const overview=render('overview');assert.match(overview,/Your workspace/);assert.doesNotMatch(overview,/<tbody>|admin-dropzone/);
 const upload=render('upload');assert.match(upload,/admin-dropzone/);assert.match(upload,/Upload a folder/);assert.doesNotMatch(upload,/<tbody>/);
 const folders=render('folders');assert.match(folders,/aria-label="Manage folders"/);assert.match(folders,/New folder path|All folders/);
 const bank=render('tests');assert.match(bank,/<tbody>/);assert.doesNotMatch(bank,/admin-dropzone|aria-label="Test folders"/);
});

