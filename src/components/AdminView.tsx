import {AdminDashboard} from './AdminDashboard';
import {downloadCsv} from '../services/adminTools';
import {startLibraryDrag} from '../services/libraryDrag';
import {PaginatedTable} from './PaginatedTable';
import {MediaStorageStatus} from './MediaStorageStatus';
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
  location?: string;
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
  onPermanentDelete?: (ids:string[])=>Promise<void>;
  onDeleteTest: (id: string) => Promise<void>;
  onRestoreTest: (id: string) => Promise<void>;
  onSetCollection: (ids: string[], collection: string) => Promise<void>;
  onRenameTest?: (id:string,title:string) => Promise<void>;
  onCopyTests?:(ids:string[],folderId:string,registry?:LibraryFolder[])=>Promise<void>;
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
  section="tests",location="",onNavigate,onDeleteFolders,folders=[],onFolderChange,
  tests,
  reports,
  learners,
  adminUid,
  onUploadFiles,
  onNewTest,
  onDeleteTest,onPermanentDelete,
  onRestoreTest,
  onSetCollection,
  onRefreshTitles,
  onRenameTest, onDuplicateTest, onCopyTests, onExportSelected,
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
    "open",
  );

  const [purgeIds,setPurgeIds]=useState<string[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [sort, setSort] = useState("title");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [collection, setCollection] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [skillFilter,setSkillFilter]=useState('');
  const [uploadSkill,setUploadSkill]=useState<'reading'|'listening'>('reading');
  const [statusFilter,setStatusFilter]=useState(()=>new URLSearchParams(location.split('?')[1]||'').get('status')||'');
  const [qualityFilter,setQualityFilter]=useState(()=>new URLSearchParams(location.split('?')[1]||'').get('quality')==='review');
  const [compact,setCompact]=useState(true);
  const [reportSearch,setReportSearch]=useState("");
  const [reportCategory,setReportCategory]=useState("");
  const [renameTest,setRenameTest]=useState<TestMeta|null>(null);
  const [newTitle,setNewTitle]=useState('');
  const [recursive, setRecursive] = useState(section!=='folders');
  useEffect(()=>{setSelected([]);},[tab,search,collectionFilter,skillFilter,statusFilter,qualityFilter,recursive]);
  useEffect(()=>{if(section==='folders'){setSkillFilter('');setRecursive(false);}},[section]);
  const [renamePath, setRenamePath] = useState("");

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
      if (section==='folders'&&!recursive&&!collectionFilter&&folderLocation(t.folderId,folders))return false;
      if (!testInFolder(t,collectionFilter,folders,recursive)) return false;
      if (!search) return true;
      const q = search.trim().toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.passageTitles || []).some(title=>title.toLowerCase().includes(q)) ||
        folderLocation(t.folderId,folders).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => compareTests({...a,source:folderLocation(a.folderId,folders)},{...b,source:folderLocation(b.folderId,folders)},sort));


  const visibleTests=filteredTests;

  const filteredReports = reports.filter(r => (reportFilter==='all'||r.status===reportFilter) && (!reportCategory||r.category===reportCategory) && (r.testTitle+' '+r.message+' '+r.category).toLowerCase().includes(reportSearch.trim().toLowerCase())).sort((a,b)=>b.createdAt-a.createdAt);
  const clearFilters=()=>{setSearch('');setSkillFilter('');setStatusFilter('');setQualityFilter(false);setCollectionFilter('');};
  const exportCatalog=()=>downloadCsv('test-catalog.csv',[['Title','Skill','Status','Folder','Questions','Parts','Updated','Warnings'],...filteredTests.map(t=>[t.title,t.skill,t.status,folderLocation(t.folderId,folders),t.questions,t.passages,new Date(t.updatedAt).toISOString(),catalogIssues(t).join('; ')])]);

  const renderTestList=()=> <div className={"folder-tests-content "+(compact?"admin-density-compact":"")}>          <h3 className="folder-tests-heading">Tests {collectionFilter==='unfiled'?'without a folder':collectionFilter?'in '+(folders.find(f=>f.id===collectionFilter)?.name||'this folder'):section==='folders'?'at top level':''} <small>({filteredTests.length})</small></h3>
          <div className="admin-view-tabs" aria-label="Quick library filters">{[['','All tests'],['published','Published'],['draft','Drafts']].map(([value,label])=><button key={label} aria-pressed={statusFilter===value&&!qualityFilter} onClick={()=>{setStatusFilter(value);setQualityFilter(false)}}>{label}</button>)}<button aria-pressed={qualityFilter} onClick={()=>{setQualityFilter(v=>!v);setStatusFilter('')}}>Needs review</button><span className="admin-results-count" role="status">{filteredTests.length} results</span></div>
          <div className="admin-filters">{section==='folders'&&<label><input type="checkbox" checked={recursive} onChange={e=>setRecursive(e.target.checked)}/>Include subfolders</label>}
            <label>Skill<Select value={skillFilter} onChange={e=>setSkillFilter(e.target.value)}><option value="">All skills</option><option value="reading">Reading</option><option value="listening">Listening</option></Select></label>
            <label>Status<Select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></Select></label>
            <label><input type="checkbox" checked={qualityFilter} onChange={e=>setQualityFilter(e.target.checked)}/> Needs content review</label>
            <label>
              Sort tests
              <Select value={sort} onChange={(e) => setSort(e.target.value)}>
                {sortOptions.map(([id,label]) => <option key={id} value={id}>{label}</option>)}
              </Select>
            </label>
            {section!=="folders"&&<label>
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
            </label>}
            <button className="studio-secondary" onClick={onViewStudents}>
              View student attempts
            </button>
          </div>
          <div className="admin-list-tools"><span>Select rows for bulk actions.</span><button className="studio-quiet" onClick={clearFilters}>Reset filters</button><button className="studio-quiet" aria-pressed={compact} onClick={()=>setCompact(v=>!v)}>{compact?'Show passage titles':'Compact rows'}</button><button className="studio-secondary" disabled={!filteredTests.length} onClick={exportCatalog}>Export filtered CSV</button></div>
          {selected.length > 0 && (
            <div className="admin-bulk">
              <strong>{selected.length} selected</strong><button className="studio-quiet" disabled={busy} onClick={()=>setSelected([])}>Clear selection</button>
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
                <><button className="studio-secondary studio-danger" disabled={busy||!selected.length||!onPermanentDelete} onClick={()=>setPurgeIds(selected)}>Delete permanently</button><button
                  className="studio-secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      for (const id of selected) await onRestoreTest(id);
                    })
                  }
                >
                  Restore selected
                </button></>
              )}
            </div>
          )}
          
          {filteredTests.length === 0 ? (
            <div className="studio-empty">
              {tab === "archive"
                ? "No archived tests."
                : 'No tests match this view. Reset filters, create a test or import files.'}
            </div>
          ) : (
            <div className="studio-table-wrap">
              <PaginatedTable key={[search,skillFilter,statusFilter,qualityFilter,collectionFilter,sort,tab].join(":")} className="studio-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all filtered tests (all pages)"
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
                    <th>Parts / passages</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTests.map((t) => (
                    <tr key={t.id} draggable={section==='folders'&&!busy&&!t.deletedAt} onDragStart={e=>startLibraryDrag(e.dataTransfer,{kind:'tests',ids:selected.includes(t.id)?selected:[t.id]})}>
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
                        {t.deletedAt?<strong>{t.title}</strong>:<a className="admin-test-link" href={'/admin/tests/'+encodeURIComponent(t.id)} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&e.button===0){e.preventDefault();onEditTest(t.id)}}}>{t.title}</a>}
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
                          className={"admin-status "+t.status}
                          style={{ textTransform: "capitalize" }}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <details className="admin-file-menu"><summary>Actions</summary><div>
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
                        </div></details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PaginatedTable>
            </div>
          )}</div>;

  return (
    <div className="admin-page" style={{ paddingBottom: "40px" }}>
      {renameTest && <dialog open className="studio-modal admin-rename-dialog" aria-label="Rename test"><form onSubmit={e=>{e.preventDefault();if(!newTitle.trim()||!onRenameTest)return;const id=renameTest.id;void run(async()=>{await onRenameTest(id,newTitle.trim());setRenameTest(null);});}}><h2>Rename test</h2><input aria-label="New test title" value={newTitle} onChange={e=>setNewTitle(e.target.value)} required maxLength={250}/><div className="studio-actions"><button type="button" className="studio-secondary" onClick={()=>setRenameTest(null)}>Cancel</button><button className="studio-primary" disabled={busy}>Save title</button></div></form></dialog>}
      {purgeIds.length>0&&<ConfirmActionDialog title="Permanently delete tests?" confirmLabel="Delete permanently" onCancel={()=>setPurgeIds([])} onConfirm={()=>{const ids=purgeIds;setPurgeIds([]);void run(async()=>{await onPermanentDelete?.(ids);setSelected([])})}}>{purgeIds.length} tests, their answer keys and unused audio/images will be deleted permanently. Files shared with other tests are kept. This cannot be undone.</ConfirmActionDialog>}
      {tab==='trash'&&<section className="trash-actions studio-panel"><div><h2>Free up storage</h2><p>Permanently remove deleted tests and media no other test uses.</p></div><button className="studio-secondary studio-danger" disabled={busy||!trashedTests.length||!onPermanentDelete} onClick={()=>setPurgeIds(trashedTests.map(t=>t.id))}>Empty Trash ({trashedTests.length})</button></section>}
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
            {{overview:"Your library, content and learner progress in one place.",tests:"Find, edit and publish tests, individually or in bulk.",folders:"Choose a source or book on the left. Rename or move any folder using its row actions. Reading and Listening live together.",upload:"Choose files or drag them here to preview. Nothing is imported until you confirm.",reports:"Review and resolve content issues reported by learners.",users:"Manage learner accounts and review their attempts.",archive:"Tests set aside for now. Restore them whenever you need.",trash:"Restore tests or permanently delete them to free storage."}[section]}
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

      {section === "upload" && <><MediaStorageStatus/><div className="collection-view-tabs" aria-label="Upload skill">{(['reading','listening'] as const).map(skill=><button key={skill} aria-pressed={uploadSkill===skill} className={uploadSkill===skill?'active':''} onClick={()=>setUploadSkill(skill)}>Upload {skill==='reading'?'Reading':'Listening'}</button>)}</div><section
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
      {section === "overview" && <><AdminDashboard tests={tests} learners={learners} reports={reports} onNavigate={go} onReview={()=>go('/admin/tests?quality=review')}/><details className="admin-storage-details"><summary>Storage & usage</summary><StorageOverview tests={tests}/></details></>}
      {section === "upload" && <section className="studio-panel"><h2>Before you import</h2><ol><li>Choose ZIP, HTML, JSON files or a folder.</li><li>Review tests, passages, questions and warnings.</li><li>Select tests, adjust names, destination and status.</li><li>Confirm to upload images and save tests.</li></ol><p>Tests are published by default. Choose Draft in the preview if you want to review them privately.</p></section>}
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

          {section === "folders" && <FolderManager tests={tests} folders={folders} value={collectionFilter} skill={skillFilter==='listening'?'listening':'reading'} onSkillChange={skill=>{setSkillFilter(skill);setCollectionFilter('');setSelected([]);}} onOpen={id=>{setCollectionFilter(id);setSelected([]);}} onChange={onFolderChange} onMoveTests={onSetCollection} onCopyTests={onCopyTests} selectedTests={selected} onClearTests={()=>setSelected([])} onDelete={onDeleteFolders|| (async()=>{throw new Error("Folder saving unavailable.");})}>{renderTestList()}</FolderManager>}
          {section!=="folders"&&renderTestList()}
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

          <div className="admin-filters"><label>Search reports<input value={reportSearch} onChange={e=>setReportSearch(e.target.value)} placeholder="Test title, message or category"/></label><label>Category<select value={reportCategory} onChange={e=>setReportCategory(e.target.value)}><option value="">All categories</option>{[...new Set(reports.map(r=>r.category))].sort().map(v=><option key={v}>{v}</option>)}</select></label><span role="status">{filteredReports.length} reports</span><button className="studio-secondary" disabled={!filteredReports.length} onClick={()=>downloadCsv('content-reports.csv',[['Test','Question','Category','Message','Status','Created'],...filteredReports.map(r=>[r.testTitle,r.question,r.category,r.message,r.status,new Date(r.createdAt).toISOString()])])}>Export CSV</button></div>
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

                  <button className="studio-secondary" disabled={!tests.some(t=>t.id===report.testId&&!t.deletedAt)} onClick={()=>onEditTest(report.testId)}>Open test editor</button>
                  <button
                    className="studio-quiet"
                    disabled={busy}
                    onClick={() => void run(()=>onToggleReportStatus(report))}
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
              <PaginatedTable className="studio-table">
                <thead>
                  <tr>
                    <th>Learner Name</th>
                    <th>Email</th>
                    <th>Target Band</th><th>Created</th>
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
                      <td>{learner.target}</td><td>{learner.createdAt?new Date(learner.createdAt).toLocaleString():"Not recorded"}</td>
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
                        <button className="studio-quiet" onClick={()=>go("/admin/students/"+encodeURIComponent(learner.id))}>Manage account</button>
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
              </PaginatedTable>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

