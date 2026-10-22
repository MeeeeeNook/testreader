import { ConfirmActionDialog } from "./ConfirmActionDialog";
import React, { useState, useRef } from "react";
import { TestMeta, ContentReport, UserProfile } from "../types";

interface AdminViewProps {
  tests: TestMeta[];
  reports: ContentReport[];
  learners: UserProfile[];
  adminUid: string;
  onUploadFiles: (files: File[]) => Promise<void>;
  onNewTest: () => void;
  onDeleteTest: (id: string) => Promise<void>;
  onRestoreTest: (id: string) => Promise<void>;
  onSetCollection: (ids: string[], collection: string) => Promise<void>;
  onSetStatus: (ids: string[], status: "published" | "draft") => Promise<void>;
  onViewStudents: () => void;
  onEditTest: (testId: string) => void;
  onExportTest: (testId: string) => void;
  onArchiveToggle: (testId: string) => void;
  onExportBank: () => void;
  onOpenUpload: () => void;
  onToggleReportStatus: (report: ContentReport) => Promise<void>;
  onToggleLearnerStatus: (
    targetUserId: string,
    newStatus: "active" | "suspended",
  ) => Promise<void>;
  onNotify: (msg: string) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  tests,
  reports,
  learners,
  adminUid,
  onUploadFiles,
  onNewTest,
  onDeleteTest,
  onRestoreTest,
  onSetCollection,
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
  const [tab, setTab] = useState<
    "tests" | "reports" | "users" | "archive" | "trash"
  >("tests");
  const [search, setSearch] = useState("");
  const [reportFilter, setReportFilter] = useState<"all" | "open" | "resolved">(
    "all",
  );

  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [sort, setSort] = useState("new");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [collection, setCollection] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
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
      if (collectionFilter && t.source !== collectionFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.source || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, undefined, { numeric: true })
        : sort === "source"
          ? a.source.localeCompare(b.source) || a.title.localeCompare(b.title)
          : sort === "questions"
            ? b.questions - a.questions
            : b.updatedAt - a.updatedAt,
    );

  const filteredReports = reports.filter((r) => {
    if (reportFilter === "all") return true;
    return r.status === reportFilter;
  });

  return (
    <div style={{ paddingBottom: "40px" }}>
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
          <h1 className="studio-heading">Admin Studio</h1>
          <p className="studio-lead">
            Manage your Cloud Firestore test bank, author new reading and
            listening exams, review learner error reports, and oversee account
            access.
          </p>
        </div>

        <div className="studio-actions">
          <button className="studio-primary" onClick={onNewTest}>
            + New Test
          </button>
          <button className="studio-secondary" onClick={onOpenUpload}>
            Upload Files (ZIP/HTML/JSON)
          </button>
        </div>
      </div>

      <section
        className="admin-dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onUploadFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <strong>Drop ZIP, HTML, or JSON tests here</strong>
        <p>
          Nested ZIPs and JSON backups are supported. You can also select an
          unzipped folder with its diagrams.
        </p>
        <button
          className="studio-secondary"
          onClick={() => folderInput.current?.click()}
        >
          Upload a folder
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
            if (e.target.files) void onUploadFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </section>
      {/* Tabs */}
      <div className="studio-chips">
        {[
          { id: "tests", label: `Test Bank (${activeTests.length})` },
          {
            id: "reports",
            label: `Content Reports (${reports.filter((r) => r.status === "open").length} open)`,
          },
          { id: "users", label: `Learners (${learners.length})` },
          { id: "archive", label: `Archive (${archivedTests.length})` },
          { id: "trash", label: `Trash (${trashedTests.length})` },
        ].map((item) => (
          <button
            key={item.id}
            className={`studio-chip ${tab === item.id ? "active" : ""}`}
            onClick={() => {
              setTab(item.id as any);
              setSelected([]);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

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

          <div className="admin-filters">
            <label>
              Sort tests
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="new">Recently updated</option>
                <option value="title">Title A–Z</option>
                <option value="source">Collection A–Z</option>
                <option value="questions">Question count</option>
              </select>
            </label>
            <label>
              Collection
              <select
                value={collectionFilter}
                onChange={(e) => {
                  setCollectionFilter(e.target.value);
                  setSelected([]);
                }}
              >
                <option value="">All collections</option>
                {[...new Set(tests.map((t) => t.source).filter(Boolean))]
                  .sort()
                  .map((c) => (
                    <option key={c}>{c}</option>
                  ))}
              </select>
            </label>
            <button className="studio-secondary" onClick={onViewStudents}>
              View student attempts
            </button>
          </div>
          {selected.length > 0 && (
            <div className="admin-bulk">
              <strong>{selected.length} selected</strong>
              <label>
                Collection
                <input
                  aria-label="Destination collection"
                  list="existing-collections"
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                  placeholder="Existing or new collection"
                />
              </label>
              <datalist id="existing-collections">
                {[...new Set(tests.map((t) => t.source).filter(Boolean))].map(
                  (c) => (
                    <option key={c} value={c} />
                  ),
                )}
              </datalist>
              <button
                className="studio-secondary"
                disabled={busy || !collection.trim() || tab === "trash"}
                onClick={() =>
                  void run(() => onSetCollection(selected, collection.trim()))
                }
              >
                Move to collection
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
                          filteredTests.every((t) => selected.includes(t.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? filteredTests.map((t) => t.id)
                              : [],
                          )
                        }
                      />
                    </th>
                    <th>Test Title & Source</th>
                    <th>Skill</th>
                    <th>Sections</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTests.map((t) => (
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
                        <br />
                        <span className="studio-small">
                          {t.source || "General"}
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
            <select
              className="studio-select"
              value={reportFilter}
              onChange={(e) => setReportFilter(e.target.value as any)}
            >
              <option value="all">All Reports</option>
              <option value="open">Open Issues Only</option>
              <option value="resolved">Resolved</option>
            </select>
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
