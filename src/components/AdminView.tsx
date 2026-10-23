import {StorageOverview} from "./StorageOverview";
import {Select} from "./Select";
import {FolderPicker} from "./FolderPicker";
import {folderOptions,folderLocation,testInFolder,type LibraryFolder} from "../services/folders";
import {FolderManager} from "./FolderManager";
import {Plus,Upload,LayoutDashboard,Files,Folder,Users} from "lucide-react";
import {catalogIssues} from "../services/testAudit";
import { compareTests, sortOptions } from "../services/catalog";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import React, { useState, useRef, useEffect } from "react";
import { TestMeta, ContentReport, UserProfile } from "../types";

interface AdminViewProps {
  section?: string;
  folders?: LibraryFolder[];
  onFolderChange?: (folders:LibraryFolder[])=>Promise<void>;
  onDeleteFolders?: (folderIds:string[],trashTests:boolean)=>Promise<void>;
  onNavigate?: (path:string)=>void;
  tests: TestMeta[];
  reports: ContentReport[];
  learners: UserProfile[];
  adminUid: string;
  onUploadFiles: (files: File[],skill?:'reading'|'listening') => Promise<void>;
  onNewTest: () => void;
  onDeleteTest: (id: string) => Promise<void>;
  onRestoreTest: (id: string) => Promise<void>;
  onSetCollection: (ids: string[], collection: string) => Promise<void>;
  onRenameTest?: (id:string,title:string) => Promise<void>;
  onDuplicateTest?: (id:string) => Promise<void>;
  onExportSelected?: (ids:string[]) => Promise<void>;
  onRefreshTitles?: (ids: string[]) => Promise<void>;
  onSetStatus: (ids: string[], status: "published" | "draft") => Promise<void>;
  onViewStudents: () => void;
  onEditTest: (testId: string) => void;
  onExportTest: (testId: string) => void;
  onArchiveToggle: (testId: string) => void;
  onExportBank: () => void;
  onOpenUpload: (skill?:'reading'|'listening') => void;
  onToggleReportStatus: (report: ContentReport) => Promise<void>;
  onToggleLearnerStatus: (
    targetUserId: string,
    newStatus: "active" | "suspended",
  ) => Promise<void>;
  onNotify: (msg: string) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  section="tests",onNavigate,onDeleteFolders,folders=[],onFolderChange,
  tests,
  reports,
  learners,
  adminUid,
  onUploadFiles,
  onNewTest,
  onDeleteTest,
  onRestoreTest,
  onSetCollection,
  onRefreshTitles,
  onRenameTest, onDuplicateTest, onExportSelected,
  onSetStatus,
  onViewStudents,
  onEditTest,
  onExportTest,
  onArchiveToggle,
  onExportBank,
  onOpenUpload,
  onToggleReportStatus,
  onToggleLearnerStatus,
  onNotify,
}) => {
  const folderInput = useRef<HTMLInputElement>(null);
  const tab=section==='folders'?'tests':section;
  const go=(path:string)=>onNavigate?.(path);
  const [search, setSearch] = useState("");
  const [reportFilter, setReportFilter] = useState<"all" | "open" | "resolved">(
    "all",
  );

  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [sort, setSort] = useState("title");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [collection, setCollection] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [skillFilter,setSkillFilter]=useState('reading');
  const [uploadSkill,setUploadSkill]=useState<'reading'|'listening'>('reading');
  const [statusFilter,setStatusFilter]=useState('');
  const [qualityFilter,setQualityFilter]=useState(false);
  const [page,setPage]=useState(0);
  const [renameTest,setRenameTest]=useState<TestMeta|null>(null);
  const [newTitle,setNewTitle]=useState('');
  useEffect(()=>{setPage(0);setSelected([]);},[tab,search,collectionFilter,skillFilter,statusFilter,qualityFilter]);
  const [renamePath, setRenamePath] = useState("");
  const [recursive, setRecursive] = useState(true);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setSelected([]);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const trashedTests = tests.filter((t) => t.deletedAt);
  const activeTests = tests.filter(
    (t) => t.status !== "archived" && !t.deletedAt,
  );
  const archivedTests = tests.filter(
    (t) => t.status === "archived" && !t.deletedAt,
  );

  const filteredTests = (
    tab === "trash"
      ? trashedTests
      : tab === "archive"
        ? archivedTests
        : activeTests
  )
    .filter((t) => {
      if (skillFilter && t.skill !== skillFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (qualityFilter && !catalogIssues(t).length) return false;
      if (!testInFolder(t,collectionFilter,folders,recursive)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        folderLocation(t.folderId,folders).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => compareTests({...a,source:folderLocation(a.folderId,folders)},{...b,source:folderLocation(b.folderId,folders)},sort));

  const pages=Math.max(1,Math.ceil(filteredTests.length/25));
  const currentPage=Math.min(page,pages-1);
  const visibleTests=filteredTests.slice(currentPage*25,currentPage*25+25);

  const filteredReports = reports.filter((r) => {
    if (reportFilter === "all") return true;
    return r.status === reportFilter;
  });

  return (
    <div className="admin-page" style={{ paddingBottom: "40px" }}>
      {renameTest && <dialog open className="studio-modal admin-rename-dialog" aria-label="Rename test"><form onSubmit={e=>{e.preventDefault();if(!newTitle.trim()||!onRenameTest)return;const id=renameTest.id;void run(async()=>{await onRenameTest(id,newTitle.trim());setRenameTest(null);});}}><h2>Rename test</h2><input aria-label="New test title" value={newTitle} onChange={e=>setNewTitle(e.target.value)} required maxLength={250}/><div className="studio-actions"><button type="button" className="studio-secondary" onClick={()=>setRenameTest(null)}>Cancel</button><button className="studio-primary" disabled={busy}>Save title</button></div></form></dialog>}
      {deleteIds.length > 0 && (
        <ConfirmActionDialog
          title="Move tests to Trash?"
          confirmLabel="Move to Trash"
          onCancel={() => setDeleteIds([])}
          onConfirm={() => {
            const ids = deleteIds;
            setDeleteIds([]);
            void run(async () => {
              for (const id of ids) await onDeleteTest(id);
            });
          }}
        >
          {deleteIds.length} test(s) will be removed from the library. You can
          restore them from Trash.
        </ConfirmActionDialog>
      )}
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">YOUR CONTENT WORKSPACE</div>
          <h1 className="studio-heading">{{overview:"Overview",tests:"Tests",folders:"Folders",upload:"Upload & Import",reports:"Content reports",users:"Students",archive:"Archive",trash:"Trash"}[section]||"Admin Studio"}</h1>
          <p className="studio-lead">
            {{overview:"Your library, content and learner progress in one place.",tests:"Find, edit and publish tests, individually or in bulk.",folders:"Create folders and subfolders. Open a folder to manage its tests, or select several folders for bulk actions.",upload:"Choose files or drag them here to preview. Nothing is imported until you confirm.",reports:"Review and resolve content issues reported by learners.",users:"Manage learner accounts and review their attempts.",archive:"Tests set aside for now. Restore them whenever you need.",trash:"Restore tests removed from the library."}[section]}
          </p>
        </div>

        <div className="studio-actions">
          <button className="studio-primary" onClick={onNewTest}>
            <Plus size={16}/> New test
          </button>
          <button className="studio-secondary" onClick={()=>onOpenUpload('reading')}>
            <Upload size={16}/> Upload Reading
          </button><button className="studio-secondary" onClick={()=>onOpenUpload('listening')}><Upload size={16}/> Upload Listening</button>
        </div>
      </div>

      {section === "upload" && <><div className="collection-view-tabs" aria-label="Upload skill">{(['reading','listening'] as const).map(skill=><button key={skill} aria-pressed={uploadSkill===skill} className={uploadSkill===skill?'active':''} onClick={()=>setUploadSkill(skill)}>Upload {skill==='reading'?'Reading':'Listening'}</button>)}</div><section
        className="admin-dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onUploadFiles(Array.from(e.dataTransfer.files),uploadSkill);
        }}
      >
        <strong>Drop {uploadSkill==='reading'?'Reading':'Listening'} ZIP, HTML, or JSON tests here</strong>
        <p>
          {uploadSkill==='listening'?'Include the audio files inside the ZIP. Review recordings and transcripts before importing.':'Include the passages, questions and diagrams. Review the test before importing.'}
        </p>
        <button
          className="studio-secondary"
          onClick={() => folderInput.current?.click()}
        >
          Upload {uploadSkill==='reading'?'Reading':'Listening'} folder
        </button>
        <input
          ref={(e) => {
            folderInput.current = e;
            if (e) e.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void onUploadFiles(Array.from(e.target.files),uploadSkill);
            e.target.value = "";
          }}
        />
      </section></>}
      {section === "overview" && <><StorageOverview tests={tests}/><div className="admin-stat-grid">{[['Published',tests.filter(t=>t.status==='published'&&!t.deletedAt).length],['Drafts',tests.filter(t=>t.status==='draft'&&!t.deletedAt).length],['Needs review',tests.filter(t=>!t.deletedAt&&catalogIssues(t).length>0).length],['Students',learners.length]].map(([label,count])=><div key={String(label)}><strong>{count}</strong><span>{label}</span></div>)}</div>
      <div className="admin-overview-grid"><section className="studio-panel"><h2>Your workspace</h2><p>Import new tests, organise your folders and review content before publishing.</p><div className="admin-shortcuts">{[['/admin/upload','Import tests','Preview files before importing'],['/admin/folders','Organise folders','Manage sources and subfolders'],['/admin/tests','Manage tests','Edit, publish and manage in bulk'],['/admin/students','Review students','View attempt history and results']].map(([url,title,description])=><button key={url} onClick={()=>go(url)}><strong>{title} <span aria-hidden="true">›</span></strong><span>{description}</span></button>)}</div></section><section className="studio-panel"><h2>Needs attention</h2><p>{reports.filter(r=>r.status==='open').length} unresolved content reports</p><p>{tests.filter(t=>!t.deletedAt&&catalogIssues(t).length).length} tests need content review</p><p>{trashedTests.length} tests in Trash</p><button className="studio-secondary" onClick={()=>go('/admin/reports')}>Review reports</button></section></div></>}
      {section === "upload" && <section className="studio-panel"><h2>Before you import</h2><ol><li>Choose ZIP, HTML, JSON files or a folder.</li><li>Review tests, passages, questions and warnings.</li><li>Select tests, adjust names, destination and status.</li><li>Confirm to upload images and save tests.</li></ol><p>Tests are imported as drafts by default, ready for review.</p></section>}
      {/* Test Bank & Archive Tab */}
      {(tab === "tests" || tab === "archive" || tab === "trash") && (
        <div className="studio-panel">
          <div className="studio-toolbar">
            <div className="studio-search">
              <input
                placeholder="Search test title or collection source…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button className="studio-secondary" onClick={onExportBank}>
              Export Entire Bank (JSON)
            </button>
          </div>

          {section === "folders" && <FolderManager tests={tests} folders={folders} value={collectionFilter} skill={skillFilter==='listening'?'listening':'reading'} onSkillChange={skill=>{setSkillFilter(skill);setCollectionFilter('');setSelected([]);}} onOpen={id=>{setCollectionFilter(id);setSelected([]);}} onChange={onFolderChange} onDelete={onDeleteFolders|| (async()=>{throw new Error("Folder saving unavailable.");})}/>}
          <div className="admin-filters">
            <label>Skill<Select value={skillFilter} onChange={e=>setSkillFilter(e.target.value)}><option value="">All skills</option><option value="reading">Reading</option><option value="listening">Listening</option></Select></label>
            <label>Status<Select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></Select></label>
            <label><input type="checkbox" checked={qualityFilter} onChange={e=>setQualityFilter(e.target.checked)}/> Needs content review</label>
            <label>
              Sort tests
              <Select value={sort} onChange={(e) => setSort(e.target.value)}>
                {sortOptions.map(([id,label]) => <option key={id} value={id}>{label}</option>)}
              </Select>
            </label>
            <label>
              Folder
              <Select
                value={collectionFilter}
                onChange={(e) => {
                  setCollectionFilter(e.target.value);
                  setRenamePath(e.target.value);
                  setSelected([]);
                }}
              >
                <option value="">All folders</option><option value="unfiled">Unfiled</option>{folderOptions(folders).map(f=><option key={f.id} value={f.id}>{f.path}</option>)}
              </Select>
            </label>
            <button className="studio-secondary" onClick={onViewStudents}>
              View student attempts
            </button>
          </div>
          <p className="studio-lead">Select tests below and choose Move to. Create folders on the Folders page.</p>
          {selected.length > 0 && (
            <div className="admin-bulk">
              <strong>{selected.length} selected</strong>
              {onExportSelected&&<button className="studio-secondary" disabled={busy} onClick={()=>void run(()=>onExportSelected(selected))}>Export selected</button>}
              <FolderPicker folders={folders} value={collection} onChange={setCollection} label="Move to"/>
              <button
                className="studio-secondary"
                disabled={busy || tab === "trash"}
                onClick={() =>
                  void run(() => onSetCollection(selected, collection))
                }
              >
                Move to folder
              </button>
              {tab !== "trash" && (
                <>
                  <button
                    className="studio-secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() => onSetStatus(selected, "published"))
                    }
                  >
                    Publish
                  </button>
                  <button
                    className="studio-secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() => onSetStatus(selected, "draft"))
                    }
                  >
                    Make draft
                  </button>
                  <button
                    className="studio-secondary studio-danger"
                    disabled={busy}
                    onClick={() => setDeleteIds(selected)}
                  >
                    Delete
                  </button>
                </>
              )}
              {tab === "trash" && (
                <button
                  className="studio-secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      for (const id of selected) await onRestoreTest(id);
                    })
                  }
                >
                  Restore selected
                </button>
              )}
            </div>
          )}
          <div className="admin-page-bar"><span>{filteredTests.length} tests · page {currentPage+1} / {pages}</span><button disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>← Previous</button><button disabled={currentPage>=pages-1} onClick={()=>setPage(currentPage+1)}>Next →</button></div>
          {filteredTests.length === 0 ? (
            <div className="studio-empty">
              {tab === "archive"
                ? "No archived tests."
                : 'No tests found. Click "+ New Test" or "Upload Files" to get started.'}
            </div>
          ) : (
            <div className="studio-table-wrap">
              <table className="studio-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all visible tests"
                        checked={
                          filteredTests.length > 0 &&
                          visibleTests.every((t) => selected.includes(t.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...new Set([...selected,...visibleTests.map(t=>t.id)])]
                              : selected.filter(id=>!visibleTests.some(t=>t.id===id)),
                          )
                        }
                      />
                    </th>
                    <th>Test title & folder</th>
                    <th>Skill</th>
                    <th>Sections</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTests.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${t.title}`}
                          checked={selected.includes(t.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked
                                ? [...prev, t.id]
                                : prev.filter((id) => id !== t.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>{t.title}</strong>
                        {t.passageTitles?.length ? <ul className="admin-passage-list">{t.passageTitles.map((title,i)=><li key={i}>{title}</li>)}</ul>:null}
                        {catalogIssues(t).map(issue=><span className="admin-quality-tag" key={issue}>{issue}</span>)}
                        <br />
                        <span className="studio-small">
                          {folderLocation(t.folderId,folders)||"Unfiled"}
                        </span>
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{t.skill}</td>
                      <td>
                        {t.passages} parts · {t.questions} Q
                      </td>
                      <td>
                        <span
                          className="studio-tag"
                          style={{ textTransform: "uppercase" }}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="studio-quiet"
                            disabled={Boolean(t.deletedAt) || busy}
                            onClick={() => onEditTest(t.id)}
                          >
                            Edit
                          </button>
                          {onRenameTest&&!t.deletedAt&&<button className="studio-quiet" disabled={busy} onClick={()=>{setRenameTest(t);setNewTitle(t.title);}}>Rename</button>}
                          {onDuplicateTest&&!t.deletedAt&&<button className="studio-quiet" disabled={busy} onClick={()=>void run(()=>onDuplicateTest(t.id))}>Duplicate draft</button>}
                          <button
                            className="studio-quiet"
                            onClick={() => onExportTest(t.id)}
                          >
                            Export
                          </button>
                          <button
                            className="studio-quiet studio-danger"
                            disabled={busy}
                            onClick={() => {
                              if (tab === "trash")
                                void run(() => onRestoreTest(t.id));
                              else setDeleteIds([t.id]);
                            }}
                          >
                            {tab === "trash"
                              ? "Restore deleted test"
                              : "Delete"}
                          </button>
                          <button
                            className="studio-quiet"
                            disabled={Boolean(t.deletedAt) || busy}
                            hidden={tab === "trash"}
                            onClick={() => onArchiveToggle(t.id)}
                          >
                            {t.status === "archived" ? "Restore" : "Archive"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Content Reports Tab */}
      {tab === "reports" && (
        <div className="studio-panel">
          <div className="studio-heading-line" style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>Student Content Reports</h3>
            <Select
              className="studio-select"
              value={reportFilter}
              onChange={(e) => setReportFilter(e.target.value as any)}
            >
              <option value="all">All Reports</option>
              <option value="open">Open Issues Only</option>
              <option value="resolved">Resolved</option>
            </Select>
          </div>

          {filteredReports.length === 0 ? (
            <div className="studio-empty">
              No content reports matching filter.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {filteredReports.map((report) => (
                <article key={report.id} className="study-note">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      className="studio-tag"
                      style={{ textTransform: "uppercase" }}
                    >
                      {report.status}
                    </span>
                    <span className="studio-small">
                      {new Date(report.createdAt).toLocaleString()} · Category:{" "}
                      {report.category}
                    </span>
                  </div>

                  <h4 style={{ margin: "8px 0 4px", fontSize: "15px" }}>
                    {report.testTitle} — Question {report.question || "General"}
                  </h4>

                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: "13px",
                      color: "var(--studio-ink)",
                    }}
                  >
                    "{report.message}"
                  </p>

                  <button
                    className="studio-quiet"
                    onClick={() => onToggleReportStatus(report)}
                  >
                    {report.status === "resolved"
                      ? "Reopen Issue"
                      : "Mark as Resolved"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Learners Management Tab */}
      {tab === "users" && (
        <div className="studio-panel">
          <div className="studio-heading-line">
            <h3 style={{ margin: 0 }}>Learner Accounts & Suspension</h3>
            <button className="studio-primary" onClick={onViewStudents}>
              View attempts and scores →
            </button>
          </div>
          <p className="studio-small" style={{ margin: "6px 0 16px" }}>
            Manage registered student accounts. Real suspension is enforced via
            Firestore security rules and backend server gates to prevent
            unauthorized access.
          </p>

          {learners.length === 0 ? (
            <div className="studio-empty">
              No registered learner profiles found yet.
            </div>
          ) : (
            <div className="studio-table-wrap">
              <table className="studio-table">
                <thead>
                  <tr>
                    <th>Learner Name</th>
                    <th>Email</th>
                    <th>Target Band</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {learners.map((learner) => (
                    <tr key={learner.id}>
                      <td>
                        <strong>{learner.name || "Anonymous Learner"}</strong>
                        <br />
                        <span className="studio-small">{learner.id}</span>
                      </td>
                      <td>{learner.email}</td>
                      <td>{learner.target}</td>
                      <td>
                        <span
                          className={`studio-tag ${
                            learner.status === "suspended"
                              ? "studio-danger"
                              : ""
                          }`}
                        >
                          {learner.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {learner.id !== adminUid ? (
                          <button
                            className={`studio-quiet ${
                              learner.status === "suspended"
                                ? ""
                                : "studio-danger"
                            }`}
                            onClick={async () => {
                              const newStatus =
                                learner.status === "suspended"
                                  ? "active"
                                  : "suspended";
                              await onToggleLearnerStatus(
                                learner.id,
                                newStatus,
                              );
                              onNotify(`Learner account ${newStatus}.`);
                            }}
                          >
                            {learner.status === "suspended"
                              ? "Activate Account"
                              : "Suspend Account"}
                          </button>
                        ) : (
                          <span className="studio-small">Current Admin</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

