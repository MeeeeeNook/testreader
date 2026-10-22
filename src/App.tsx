import {AdminSidebar} from './components/AdminSidebar';
import {ImportPreview} from './components/ImportPreview';
import {prepareImport,disposeImport,replaceImportAssets,type ImportPlan,type ImportCandidate} from './services/importPreview';
import { PortalHeader } from "./components/PortalHeader";
import { HomeView } from "./components/HomeView";
import { PracticeCatalog } from "./components/PracticeCatalog";
import { KnowledgeView, ForumView, ContributionView, LoginNotice } from "./components/CommunityViews";
import { sectionSummaries } from "./services/portal";
const ContentAdminView = React.lazy(() => import("./components/ContentAdminView").then(m => ({default:m.ContentAdminView})));
import { createId } from "./services/ids";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { User } from "firebase/auth";
import { subscribeAuth } from "./services/auth";
import { firestoreAdapter } from "./services/firestoreAdapter";
import {
  TestMeta,
  EditableTest,
  UserProfile,
  AttemptRecord,
  VocabularyItem,
  ContentReport,
} from "./types";
import {
  toEditable,
  fingerprint,
} from "./services/importer";

import { MockBuilderView } from "./components/MockBuilderView";
import { ProgressView } from "./components/ProgressView";
import { VocabularyView } from "./components/VocabularyView";
import { SettingsView } from "./components/SettingsView";
const AdminView = React.lazy(() =>
  import("./components/AdminView").then((m) => ({ default: m.AdminView })),
);
const TestEditorView = React.lazy(() =>
  import("./components/TestEditorView").then((m) => ({
    default: m.TestEditorView,
  })),
);
import { TestWorkspace } from "./components/TestWorkspace";

import { usePageRouter } from "./services/usePageRouter";
import { readAttempts } from "./services/localHistory.js";
import { syncHistory } from "./services/historySync";

const StudentsView = React.lazy(() =>
  import("./components/StudentsView").then((m) => ({
    default: m.StudentsView,
  })),
);
import { LeaveTestDialog } from "./components/LeaveTestDialog";

export default function App() {
  const {
    page,
    location,
    navigate,
    setGuard,
    setRoute,
    pendingNavigation,
    confirmNavigation,
    cancelNavigation,
  } = usePageRouter();
  const route = page.name;
  const [authReady, setAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "local" | "syncing" | "synced" | "offline"
  >("local");
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [adminDataError, setAdminDataError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "student">("student");
  const [suspended, setSuspended] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("reading-room:profile:guest") || "{}",
      );
      return {
        name: "Learner",
        target: 7.5,
        fontSize: 16,
        favorites: [],
        ...saved,
        language: "en", theme: "light",
        id: "guest",
        email: "",
        status: "active",
      };
    } catch {
      return {
        id: "guest",
        email: "",
        name: "Learner",
        target: 7.5,
        language: "en",
        theme: "light",
        fontSize: 16,
        favorites: [],
        status: "active",
      };
    }
  });

  const [tests, setTests] = useState<TestMeta[]>([]);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [learners, setLearners] = useState<UserProfile[]>([]);

  // Active test workspace state
  const [activeTest, setActiveTest] = useState<EditableTest | null>(null);
  const [activeMode, setActiveMode] = useState<"practice" | "exam">("practice");
  const [activeDuration, setActiveDuration] = useState(60);
  const [activePreview, setActivePreview] = useState(false);

  // Active test editor state
  const [editingTest, setEditingTest] = useState<EditableTest | null>(null);

  // Dialog & modal states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [setupMode, setSetupMode] = useState<"practice" | "exam">("practice");
  const [setupTime, setSetupTime] = useState(60);
  const [setupSection, setSetupSection] = useState<"all" | number>("all");
  const [selectedTestFull, setSelectedTestFull] = useState<EditableTest | null>(
    null,
  );

  // Upload progress modal
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [importPlan,setImportPlan]=useState<ImportPlan|null>(null);
  const importPlanRef=useRef<ImportPlan|null>(null);
  const preparingImport=useRef(false);
  const importing=useRef(false);
  const closeImportPreview=()=>{if(importPlanRef.current)disposeImport(importPlanRef.current);importPlanRef.current=null;setImportPlan(null);};
  useEffect(()=>()=>{if(importPlanRef.current)disposeImport(importPlanRef.current);},[]);
  const [uploadReport, setUploadReport] = useState<{
    imported: number;
    duplicates: number;
    errors: string[];
  } | null>(null);

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 5000);
  }, []);

  const previousUser = useRef<string | null | undefined>(undefined);
  // Subscribe to Authentication state
  useEffect(() => {
    const unsubscribe = subscribeAuth((state) => {
      if (state.loading) return;
      if (
        previousUser.current !== undefined &&
        previousUser.current !== (state.user?.uid || null)
      ) {
        setActiveTest(null);
        setEditingTest(null);
        setSelectedTestFull(null);
        setGuard(false);
        if (/\/take\//.test(window.location.pathname)) setRoute("practice");
        setAttempts([]);
        setVocabulary([]);
        setReports([]);
        setLearners([]);
        document.body.classList.remove("hub-exam");
      }
      previousUser.current = state.user?.uid || null;
      setAuthReady(true);
      setUser(state.user);
      setUserRole(
        state.role === "admin" &&
          state.user?.email === "manhcuong2006ht@gmail.com" &&
          state.user.emailVerified
          ? "admin"
          : "student",
      );
      setSuspended(state.suspended);
      if (state.profile) {
        setProfile({...state.profile,language:"en",theme:"light"});
      } else {
        let prefs = {};
        try {
          prefs = JSON.parse(
            localStorage.getItem("reading-room:profile:guest") || "{}",
          );
        } catch {}
        setProfile({
          name: "Learner",
          target: 7.5,
          fontSize: 16,
          favorites: [],
          ...prefs,
          language: "en", theme: "light",
          id: "guest",
          email: "",
          status: "active",
        });
      }
    });
    return unsubscribe;
  }, []);

  // Sync theme, font size, language with document root
  useEffect(() => {
    document.body.classList.remove("studio-dark");
    document.documentElement.style.setProperty(
      "--study-font-size",
      `${profile.fontSize}px`,
    );
    document.documentElement.lang = "en";
    document.documentElement.style.colorScheme = "light";
  }, [profile.theme, profile.fontSize, profile.language]);

  const runHistorySync = useCallback(async () => {
    const uid = user?.uid;
    if (!uid) {
      setSyncStatus("local");
      return;
    }
    setSyncStatus("syncing");
    try {
      const records = await syncHistory(uid);
      if (previousUser.current === uid) {
        setAttempts(records);
        setSyncStatus("synced");
      }
    } catch {
      if (previousUser.current === uid) {
        setAttempts(readAttempts(localStorage, uid));
        setSyncStatus("offline");
      }
    }
  }, [user?.uid]);

  const loadData = useCallback(async () => {
    if (!authReady) return;
    const uid = user?.uid || null;
    const current = () => previousUser.current === uid;
    setAttempts(readAttempts(localStorage, profile.id));
    try {
      let cursor;
      const catalog: TestMeta[] = [];
      do {
        const batch = await firestoreAdapter.listTests({
          pageSize: 100,
          lastDoc: cursor,
        });
        if (!current()) return;
        catalog.push(...batch.tests);
        cursor = batch.tests.length === 100 ? batch.lastDoc : undefined;
      } while (cursor);
      setTests(catalog);
      setCatalogError("");
    } catch (error) {
      if (current())
        setCatalogError(
          error instanceof Error
            ? error.message
            : "Could not load the library.",
        );
    }
    let words: VocabularyItem[] = [];
    try {
      const saved = JSON.parse(
        localStorage.getItem(`reading-room:vocabulary:${profile.id}`) || "[]",
      );
      if (Array.isArray(saved)) words = saved;
    } catch {}
    if (user) {
      try {
        const cloud = await firestoreAdapter.list("vocabulary");
        const ids = new Set(cloud.map((w) => w.id));
        words = [...cloud, ...words.filter((w) => !ids.has(w.id))];
      } catch {}
    }
    if (!current()) return;
    setVocabulary(words);
    if (userRole === "admin") {
      const [r, l] = await Promise.allSettled([
        firestoreAdapter.list("reports"),
        firestoreAdapter.list("users"),
      ]);
      if (!current()) return;
      if (r.status === "fulfilled") setReports(r.value);
      if (l.status === "fulfilled") setLearners(l.value);
      setAdminDataError(
        [r, l]
          .filter((result) => result.status === "rejected")
          .map((result) =>
            result.status === "rejected"
              ? String(result.reason?.message || result.reason)
              : "",
          )
          .join(" · "),
      );
    }
  }, [authReady, user?.uid, userRole, profile.id]);
  useEffect(() => {
    void loadData();
  }, [loadData]);
  useEffect(() => {
    if (!authReady) return;
    void runHistorySync();
    const refresh = () => {
      setAttempts(readAttempts(localStorage, profile.id));
      void runHistorySync();
    };
    window.addEventListener("study-history-change", refresh);
    const storageChanged = (event: StorageEvent) => {
      if (event.key === "reading-room:history:v3")
        setAttempts(readAttempts(localStorage, profile.id));
    };
    window.addEventListener("online", refresh);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener("study-history-change", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", storageChanged);
    };
  }, [authReady, profile.id, runHistorySync]);

  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    setPageError("");
    setPageLoading(false);
    const hydrate = async () => {
      try {
        if (page.name === "test" && page.id) {
          setPageLoading(true);
          setSelectedTestFull(null);
          const test = await firestoreAdapter.getTestComplete(page.id);
          if (!alive) return;
          setSelectedTestFull(test);
          setSetupMode("practice");
          setSetupTime(test.duration || 60);
          const sectionIndex = page.section ? test.parts.findIndex(p => p.id === page.section) : -1;
          if (page.section && sectionIndex < 0) throw new Error("This passage is unavailable.");
          setSetupSection(sectionIndex >= 0 ? sectionIndex : "all");
          if (sectionIndex >= 0) setSetupTime(test.skill === "reading" ? 20 : 10);
        } else if (
          page.name === "workspace" &&
          page.session &&
          page.session !== sessionId
        ) {
          const launch = JSON.parse(
            sessionStorage.getItem(
              `reading-room:launch:${profile.id}:${page.session}`,
            ) || "null",
          );
          if (
            !launch?.test?.parts?.length ||
            (launch.test.sourceTestId || launch.test.id) !== page.id
          )
            throw new Error(
              "This session is unavailable on this device. Open the test from your library to start again.",
            );
          setActiveTest(launch.test);
          setActiveMode(launch.mode);
          setActiveDuration(launch.minutes);
          setActivePreview(false);
          setSessionId(page.session);
        } else if (page.name === "editor" && page.id && userRole === "admin") {
          if (page.id !== "new") {
            setPageLoading(true);
            setEditingTest(null);
            const test = await firestoreAdapter.getTestComplete(page.id);
            if (alive) setEditingTest(test);
          } else if (!editingTest) {
            setEditingTest({
              schemaVersion: 1,
              id: `test_${Date.now()}`,
              title: "New IELTS Test",
              skill: "reading",
              source: "My collection",
              access: "free",
              status: "draft",
              duration: 60,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              parts: [
                {
                  id: "p0",
                  title: "Passage 1",
                  passageHtml: "<p>Write your passage here.</p>",
                  questionHtml: "",
                  slots: {},
                  questions: [],
                },
              ],
            });
          }
        }
      } catch (error) {
        if (alive)
          setPageError(
            error instanceof Error
              ? error.message
              : "Could not open this page.",
          );
      } finally {
        if (alive) setPageLoading(false);
      }
    };
    void hydrate();
    return () => {
      alive = false;
    };
  }, [location, authReady, profile.id, userRole]);
  useEffect(() => {
    document.title = `${route === "test" ? "Test details" : getCrumb()} · IELTS Studio`;
    if (route !== "workspace") setGuard(false);
  }, [location, setGuard]);
  useEffect(() => {
    document.body.classList.toggle(
      "hub-exam",
      route === "workspace" &&
        Boolean(activeTest) &&
        page.session === sessionId,
    );
    return () => document.body.classList.remove("hub-exam");
  }, [route, activeTest?.id, page.session, sessionId]);

  // Profile update handler
  const handleUpdateProfile = async (updates: Partial<UserProfile>) => {
    const updated = { ...profile, ...updates, language: "en" as const, theme: "light" as const };
    setProfile(updated);
    try {
      localStorage.setItem(
        `reading-room:profile:${profile.id}`,
        JSON.stringify(updated),
      );
    } catch {}
    if (user) {
      await firestoreAdapter.put("users", updated);
    }
  };

  // Vocabulary handlers
  const handleSaveWord = async (word: Partial<VocabularyItem>) => {
    if (!user) { notify(false ? "Đăng nhập để lưu từ vựng." : "Sign in to save vocabulary."); throw new Error("Sign in to save vocabulary."); }
    const id = word.id || `voc_${Date.now()}`;
    const item: VocabularyItem = {
      id,
      owner: profile.id,
      word: word.word?.trim() || "",
      meaning: word.meaning?.trim() || "",
      example: word.example?.trim() || "",
      partOfSpeech: word.partOfSpeech || "noun",
      archived: word.archived || false,
      createdAt: word.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    if (user) {
      try {
        await firestoreAdapter.put("vocabulary", item);
      } catch {}
    }
    setVocabulary((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      const next =
        idx >= 0 ? prev.map((w) => (w.id === id ? item : w)) : [item, ...prev];
      try {
        localStorage.setItem(
          `reading-room:vocabulary:${profile.id}`,
          JSON.stringify(next),
        );
      } catch {}
      return next;
    });
  };

  const handleArchiveWord = async (wordId: string) => {
    const target = vocabulary.find((w) => w.id === wordId);
    if (target) {
      const updated = { ...target, archived: true };
      if (user) {
        try {
          await firestoreAdapter.put("vocabulary", updated);
        } catch {}
      }
      setVocabulary((prev) => {
        const next = prev.map((w) => (w.id === wordId ? updated : w));
        try {
          localStorage.setItem(
            `reading-room:vocabulary:${profile.id}`,
            JSON.stringify(next),
          );
        } catch {}
        return next;
      });
    }
  };

  // Toggle Favorite Test
  const handleToggleFavorite = async (testId: string) => {
    const isFav = profile.favorites.includes(testId);
    const newFavorites = isFav
      ? profile.favorites.filter((id) => id !== testId)
      : [...profile.favorites, testId];

    await handleUpdateProfile({ favorites: newFavorites });
  };

  // Start Test Workspace Session
  const handleStartSession = (
    testToStart: EditableTest,
    modeToUse: "practice" | "exam",
    durationMinutes: number,
    preview = false,
  ) => {
    const launchId = createId();
    const safe = {
      ...testToStart,
      parts: testToStart.parts.map((p) => ({
        ...p,
        questions: p.questions.map((q) => ({
          ...q,
          answer: "",
          explanationHtml: "",
          referenceQuote: "",
        })),
      })),
    };
    try {
      if (!preview)
        sessionStorage.setItem(
          `reading-room:launch:${profile.id}:${launchId}`,
          JSON.stringify({
            test: safe,
            mode: modeToUse,
            minutes: durationMinutes,
          }),
        );
    } catch {
      notify(
        "Browser storage is unavailable. Keep this tab open to retain the session.",
      );
    }
    if (
      !navigate(
        `/tests/${encodeURIComponent(testToStart.sourceTestId || testToStart.id)}/take/${launchId}`,
      )
    )
      return;
    setSessionId(launchId);
    setActivePreview(preview);
    setActiveTest(preview ? testToStart : safe);
    setActiveMode(modeToUse);
    setActiveDuration(durationMinutes);
  };

  const handleSelectTest = (testId: string) => {
    navigate(`/tests/${encodeURIComponent(testId)}`);
  };

  const handleConfirmStartTest = () => {
    if (!selectedTestFull) return;

    let chosen = JSON.parse(JSON.stringify(selectedTestFull)) as EditableTest;
    if (setupSection !== "all") {
      const sectionPart = chosen.parts[setupSection];
      if (sectionPart) {
        chosen.sourceTestId = selectedTestFull.id;
        chosen.sectionIds = [sectionPart.id];
        chosen.parts = [sectionPart];
        chosen.id = `${selectedTestFull.id}_part_${setupSection}`;
        chosen.title = `${selectedTestFull.title} — ${sectionPart.title}`;
      }
    }

    const duration = setupMode === "exam" ? chosen.duration || 60 : setupTime;
    handleStartSession(chosen, setupMode, duration);
  };

  // Admin New Test
  const handleNewTest = () => {
    const newTest: EditableTest = {
      schemaVersion: 1,
      id: `test_${Date.now()}`,
      title: "New IELTS Test",
      skill: "reading",
      source: "Internal Authoring",
      access: "free",
      status: "draft",
      duration: 60,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parts: [
        {
          id: "p0",
          title: "Passage 1",
          passageHtml:
            "<h2>Reading Passage Title</h2><p>Write or paste your reading passage here.</p>",
          questionHtml:
            "<h3>Questions 1–13</h3><p>Read the passage and answer the questions below.</p>",
          slots: {},
          questions: [],
          audio: "",
        },
      ],
    };
    setEditingTest(newTest);
    navigate("/admin/new");
  };

  // Admin Edit Test
  const handleEditTest = (testId: string) => {
    navigate(`/admin/tests/${encodeURIComponent(testId)}`);
  };

  // Admin Save Test
  const handleSaveTest = async (
    testToSave: EditableTest,
    status: "published" | "draft",
  ) => {
    testToSave.status = status;
    testToSave.access = "free";
    await firestoreAdapter.saveTestComplete(testToSave);
    await loadData();
  };

  const handleTestMeta = async (ids: string[], changes: any) => {
    if (userRole !== "admin") throw new Error("Administrator access required.");
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await firestoreAdapter.updateTestMeta(id, changes);
        setTests((previous) =>
          previous.map((t) =>
            t.id === id ? { ...t, ...changes, updatedAt: Date.now() } : t,
          ),
        );
      } catch (e) {
        errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (errors.length) throw new Error(errors.join(" · "));
  };
  const handleDeleteTest = async (id: string) => {
    const test = tests.find((t) => t.id === id);
    if (!test) return;
    await handleTestMeta([id], {
      status: "archived",
      deletedAt: Date.now(),
      restoreStatus: test.status,
    });
  };
  const handleRestoreTest = async (id: string) => {
    const test = tests.find((t) => t.id === id);
    if (!test) return;
    await handleTestMeta([id], {
      status: test.restoreStatus || "draft",
      deletedAt: null,
    });
  };

  // Admin Archive Toggle
  const handleArchiveToggle = async (testId: string) => {
    const test = tests.find((t) => t.id === testId);
    if (!test) return;
    await handleTestMeta([testId], {
      status: test.status === "archived" ? "draft" : "archived",
    });
    notify("Test status updated.");
  };

  // Admin Export Single Test
  const handleExportTest = async (testId: string) => {
    const fullTest = await firestoreAdapter.getTestComplete(testId);
    const blob = new Blob([JSON.stringify(fullTest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fullTest.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify("Test JSON exported.");
  };

  // Admin Export Complete Test Bank
  const handleExportBank = async () => {
    notify("Preparing complete test bank export…");
    const fullBank: EditableTest[] = [];
    for (const meta of tests) {
      const full = await firestoreAdapter.getTestComplete(meta.id);
      fullBank.push(full);
    }
    const backup = {
      format: "ielts-studio-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      tests: fullBank,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IELTS_Test_Bank_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify(`${fullBank.length} tests exported.`);
  };

  // Admin Toggle Report Status
  const handleToggleReportStatus = async (report: ContentReport) => {
    const newStatus = report.status === "resolved" ? "open" : "resolved";
    const updated = { ...report, status: newStatus as any };
    await firestoreAdapter.put("reports", updated);
    setReports((prev) => prev.map((r) => (r.id === report.id ? updated : r)));
    notify(`Report marked as ${newStatus}.`);
  };

  // Admin Toggle Learner Status
  const handleToggleLearnerStatus = async (
    targetUserId: string,
    newStatus: "active" | "suspended",
  ) => {
    const res = await fetch("/api/admin/user-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user?.getIdToken()}`,
      },
      body: JSON.stringify({
        targetUserId,
        newStatus,
        adminUid: user?.uid,
      }),
    });
    if (!res.ok) {
      throw new Error("Failed to update learner status on server.");
    }
    setLearners((prev) =>
      prev.map((l) =>
        l.id === targetUserId ? { ...l, status: newStatus } : l,
      ),
    );
  };

  // Prepare locally, then wait for the owner's explicit import selection.
  const handleUploadFiles = async (files: File[]) => {
    if (!files.length || userRole !== "admin" || preparingImport.current || importing.current) return;
    preparingImport.current=true;
    setUploadProgress("Preparing local preview…");setUploadReport(null);
    try {
      const plan=await prepareImport(files);
      closeImportPreview();importPlanRef.current=plan;setImportPlan(plan);
    }catch(error){notify(error instanceof Error?error.message:String(error));}
    finally{preparingImport.current=false;setUploadProgress(null);}
  };
  const confirmImport=async (items:ImportCandidate[])=>{
    const plan=importPlanRef.current;
    if(!plan||userRole!=="admin"||importing.current||!items.length)return;
    importing.current=true;setImportPlan(null);setUploadProgress("Uploading images…");
    let imported=0,duplicates=0,completed=false;
    const errors=[...plan.errors],seenIds=new Set<string>();
    try {
      const assets=new Map<string,string>();
      const selectedContent=JSON.stringify(items);
      for(const image of plan.images) {
        if(!selectedContent.includes(image.url))continue;
        // A missing diagram must never become an expired blob URL in a saved test.
        assets.set(image.url,await firestoreAdapter.uploadMedia(image.blob,`media/${createId()}-${image.name}`));
      }
      const candidates=items.map(c=>({...c,test:replaceImportAssets(c.test,assets)}));
      // 3. Save candidates to Firestore with duplicate detection
      for (const [idx, item] of candidates.entries()) {
        setUploadProgress(`Saving test ${idx + 1} of ${candidates.length}…`);
        try {
          if (seenIds.has(item.test.id)) {
            duplicates++;
            continue;
          }
          const existing = await firestoreAdapter.get("tests", item.test.id);
          if (existing) {
            const full = await firestoreAdapter.getTestComplete(item.test.id);
            const broken = full.parts.some(
              (p) =>
                p.questions.some((q) => !q.missing) &&
                !Object.keys(p.slots || {}).length,
            );
            if (!broken) {
              seenIds.add(item.test.id);
              duplicates++;
              continue;
            }
            // Repair the old incomplete importer output, keeping admin catalog settings.
            item.test = {
              ...item.test,
              title: full.title,
              source: full.source,
              status: full.status,
              access: full.access,
              duration: full.duration,
              createdAt: full.createdAt,
            };
          }
          await firestoreAdapter.saveTestComplete(item.test);
          seenIds.add(item.test.id);
          imported++;
        } catch (saveErr) {
          errors.push(
            `${item.name}: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
          );
        }
      }

      setUploadReport({ imported, duplicates, errors });completed=true;
      await loadData();
      notify(
        `Import complete: ${imported} imported or repaired, ${duplicates} duplicates skipped.`,
      );
    } catch (topErr) {
      if(!completed)setImportPlan(plan);
      notify(
        "Upload failed: " +
          (topErr instanceof Error ? topErr.message : String(topErr)),
      );
    } finally {
      importing.current=false;if(completed)closeImportPreview();setUploadProgress(null);
    }
  };

  // Breadcrumb generation
  const getCrumb = () => {
    switch (route) {
      case "home": return false ? "Trang chủ" : "Home";
      case "practice": return "Practice Test";
      case "full": return "Full Test";
      case "knowledge": return false ? "Chia sẻ kiến thức" : "Learning guides";
      case "forum": return "Forum";
      case "contribute": return false ? "Contributions" : "Contribute";
      case "content-admin": return "Manage articles";
      case "contributions-admin": return "Review contributions";
      case "library":
        return false ? "Thư viện đề thi" : "Test library";
      case "mock":
        return false ? "Thi thử đầy đủ" : "Full mock test";
      case "progress":
        return false ? "Tiến độ của tôi" : "My progress";
      case "vocabulary":
        return false ? "Sổ từ vựng" : "Vocabulary notebook";
      case "settings":
        return false
          ? "Cài đặt & dữ liệu"
          : "Settings & data";
      case "admin":
        return false
          ? "Quản trị nội dung"
          : "Content administration";
      case "editor":
        return "Test Editor";
      case "workspace":
        return activeTest?.title || "Exam workspace";
      default:
        return "Reading Studio";
    }
  };

  // If in active test workspace:
  if (route === "workspace" && activeTest && page.session === sessionId) {
    return (
      <>
        {pendingNavigation && (
          <LeaveTestDialog
            onStay={cancelNavigation}
            onLeave={confirmNavigation}
          />
        )}
        <TestWorkspace
          key={`${profile.id}:${sessionId}`}
          sessionId={sessionId}
          onSessionActive={setGuard}
          onHistorySaved={() =>
            setAttempts(readAttempts(localStorage, profile.id))
          }
          test={activeTest}
          mode={activeMode}
          initialDurationMinutes={activeDuration}
          profile={profile}
          isPreview={activePreview}
          onReturnToLibrary={() => {
            setRoute("library");
          }}
          onSaveVocabulary={handleSaveWord}
          onNotify={notify}
        />
        {toastMessage && <div className="toast visible">{toastMessage}</div>}
      </>
    );
  }

  return (
    <div id="studioHub" className="studio-hub">
      {pendingNavigation && (
        <LeaveTestDialog
          onStay={cancelNavigation}
          onLeave={confirmNavigation}
        />
      )}
      {/* Sidebar Navigation */}
      <div className="studio-main">
        <PortalHeader route={route} user={user} profile={profile} role={userRole} onNavigate={navigate} onUpdateProfile={handleUpdateProfile} onOpenProfileModal={() => setRoute("settings")} />

        {/* Account Suspension Alert */}
        {suspended && (
          <div
            style={{
              padding: "12px 36px",
              background: "#faf0ed",
              borderBottom: "1px solid #e8c8c0",
              color: "#842f1f",
              fontSize: "13px",
            }}
          >
            <strong>Account Notice:</strong> Your student account is currently
            suspended. Practice history and vocabulary saves are disabled.
            Contact an administrator to restore access.
          </div>
        )}

        <div className={userRole === "admin" && ["admin","students","editor","content-admin","contributions-admin"].includes(route) ? "admin-shell" : undefined}>
        {userRole === "admin" && ["admin","students","editor","content-admin","contributions-admin"].includes(route) && <AdminSidebar location={location} onNavigate={navigate} />}
        <main id="studioContent">
          <React.Suspense
            fallback={<div className="studio-empty">Loading page…</div>}
          >
            {!authReady && (
              <div className="studio-callout" role="status">
                Connecting your account… You can browse as a guest.
              </div>
            )}
            {authReady && user && ["progress", "settings"].includes(route) && (
              <div className="history-sync" role="status">
                {syncStatus === "local"
                  ? "Sign in before submitting to save your results."
                  : syncStatus === "syncing"
                    ? "Syncing your history…"
                    : syncStatus === "synced"
                      ? "History synced with your account."
                      : "History is safe on this device. Cloud sync will retry when connected."}
                {syncStatus === "offline" && (
                  <button
                    className="studio-quiet"
                    onClick={() => void runHistorySync()}
                  >
                    Retry sync
                  </button>
                )}
              </div>
            )}
            {catalogError && ["library", "practice", "full"].includes(route) && (
              <div className="studio-callout" role="alert">
                Library unavailable: {catalogError}{" "}
                <button
                  className="studio-secondary"
                  onClick={() => void loadData()}
                >
                  Retry
                </button>
              </div>
            )}
            {pageLoading && (
              <div className="studio-empty" role="status">
                Opening page…
              </div>
            )}
            {(pageError ||
              route === "notfound" ||
              (authReady &&
                (["admin", "editor", "students", "content-admin", "contributions-admin"].includes(route)) &&
                userRole !== "admin")) && (
              <div className="studio-panel">
                <h1>Page unavailable</h1>
                <p>
                  {pageError ||
                    "This page does not exist or requires the library owner account."}
                </p>
                <button
                  className="studio-primary"
                  onClick={() => setRoute("library")}
                >
                  Go to library
                </button>
              </div>
            )}
            {userRole === "admin" &&
              (route === "admin" || route === "students") &&
              adminDataError && (
                <div className="studio-callout" role="alert">
                  Could not load all admin data: {adminDataError}{" "}
                  <button
                    className="studio-secondary"
                    onClick={() => void loadData()}
                  >
                    Retry
                  </button>
                </div>
              )}
            {route === "home" && <HomeView tests={tests} attempts={attempts} profile={profile} onNavigate={navigate} onUpdateProfile={handleUpdateProfile} />}
            {["library", "practice", "full"].includes(route) && <PracticeCatalog tests={tests} profile={profile} attempts={attempts} full={route === "full"} category={page.category} location={location} onNavigate={navigate} loadSummary={async test => {const patch=await firestoreAdapter.getCatalogSummary(test);setTests(previous=>previous.map(item=>item.id===test.id?{...item,...patch}:item));return patch;}} />}
            {route === "knowledge" && <KnowledgeView profile={profile} location={location} onNavigate={navigate} />}
            {route === "forum" && <ForumView profile={profile} />}
            {route === "contribute" && <ContributionView profile={profile} />}
            {["content-admin", "contributions-admin"].includes(route) && userRole === "admin" && <ContentAdminView key={route} contributions={route === "contributions-admin"} onUploadFiles={handleUploadFiles} />}
            {["progress", "vocabulary"].includes(route) && !user && <LoginNotice vi={false} text={false ? "Đăng nhập để lưu từ vựng, điểm và lịch sử làm bài. Mọi đề đều miễn phí, không cần đăng nhập để luyện tập." : "Sign in to save vocabulary, scores and history. All tests are free and open to guests."} />}

            {route === "mock" && (
              <MockBuilderView
                tests={tests}
                onStartSession={handleStartSession}
                onNotify={notify}
              />
            )}

            {route === "progress" && user && (
              <ProgressView
                attempts={attempts}
                profile={profile}
                onOpenProfileModal={() => setRoute("settings")}
                selectedAttemptId={page.id}
                onSelectAttempt={(id) =>
                  navigate(`/history/${encodeURIComponent(id)}`)
                }
                onBack={() => setRoute("progress")}
                onReopenAttempt={(att) => {
                  handleSelectTest(att.testId);
                }}
              />
            )}

            {route === "vocabulary" && user && (
              <VocabularyView
                vocabulary={vocabulary}
                profile={profile}
                onSaveWord={handleSaveWord}
                onArchiveWord={handleArchiveWord}
                onNotify={notify}
              />
            )}

            {route === "settings" && (
              <SettingsView
                profile={profile}
                attempts={attempts}
                vocabulary={vocabulary}
                isAdmin={userRole === "admin"}
                onUpdateProfile={handleUpdateProfile}
                onViewStudents={() => setRoute("students")}
                onExportTestBank={handleExportBank}
                onOpenUpload={() => fileInputRef.current?.click()}
                onNotify={notify}
              />
            )}

            {route === "students" && userRole === "admin" && (
              <StudentsView
                learners={learners}
                studentId={page.id}
                attemptId={page.attempt}
                onNavigate={navigate}
              />
            )}
            {route === "admin" && userRole === "admin" && (
              <AdminView
                key={page.section || "overview"}
                section={page.section || "overview"}
                onNavigate={navigate}
                tests={tests}
                reports={reports}
                learners={learners}
                adminUid={user?.uid || ""}
                onNewTest={handleNewTest}
                onDeleteTest={handleDeleteTest}
                onDeleteFolders={async ids=>{const groups=new Map<string,string[]>();for(const id of ids){const t=tests.find(t=>t.id===id);if(t&&!t.deletedAt)groups.set(t.status,[...(groups.get(t.status)||[]),id]);}for(const [restoreStatus,group] of groups)await handleTestMeta(group,{status:"archived",deletedAt:Date.now(),restoreStatus:restoreStatus as TestMeta["status"]});notify(ids.length+" tests moved to Trash.");}}
                onRestoreTest={handleRestoreTest}
                onSetCollection={(ids, collection) =>
                  handleTestMeta(ids, { source: collection })
                }
                onRenameTest={(id,title)=>handleTestMeta([id],{title})}
                onDuplicateTest={async id=>{
                  const original=await firestoreAdapter.getTestComplete(id);
                  const {sourceTestId,sectionIds,sourceSections,...copy}=original;
                  const duplicate={...copy,id:`test_${createId()}`,title:`${copy.title} (copy)`.slice(0,250),status:"draft" as const,access:"free" as const,createdAt:Date.now(),updatedAt:Date.now()};
                  await firestoreAdapter.saveTestComplete(duplicate);
                  await loadData();notify("A draft copy was created.");
                }}
                onExportSelected={async ids=>{
                  const records=[];
                  for(const id of ids)records.push(await firestoreAdapter.getTestComplete(id));
                  const url=URL.createObjectURL(new Blob([JSON.stringify({format:"ielts-studio-backup",tests:records},null,2)],{type:"application/json"}));
                  const a=document.createElement("a");a.href=url;a.download="IELTS_Selected_Tests.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
                }}
                onRefreshTitles={async ids => {
                  for (const id of ids) {
                    const full = await firestoreAdapter.getTestComplete(id);
                    await handleTestMeta([id], {
                      passageTitles: full.parts.map(p => p.title),
                      sectionSummaries: sectionSummaries(full),
                      ...(full.parts.length === 1 ? {title: full.parts[0].title} : {}),
                    });
                  }
                  notify("Passage titles updated.");
                }}
                onSetStatus={(ids, status) => handleTestMeta(ids, { status })}
                onViewStudents={() => setRoute("students")}
                onEditTest={handleEditTest}
                onExportTest={handleExportTest}
                onArchiveToggle={handleArchiveToggle}
                onExportBank={handleExportBank}
                onOpenUpload={() => fileInputRef.current?.click()}
                onUploadFiles={handleUploadFiles}
                onToggleReportStatus={handleToggleReportStatus}
                onToggleLearnerStatus={handleToggleLearnerStatus}
                onNotify={notify}
              />
            )}

            {route === "editor" &&
              userRole === "admin" &&
              editingTest &&
              !pageLoading && (
                <TestEditorView
                  test={editingTest}
                  onSave={async (savedTest, status) => {
                    await handleSaveTest(savedTest, status);
                    setRoute("admin");
                  }}
                  onPreview={(testToPreview) => {
                    handleStartSession(testToPreview, "practice", 0, true);
                  }}
                  onClose={() => setRoute("admin")}
                  onNotify={notify}
                />
              )}
            {/* Dedicated test setup page */}
            {route === "test" && selectedTestFull && !pageLoading && (
              <section className="studio-panel test-launch-page">
                <div className="studio-modal-heading">
                  <h2>{selectedTestFull.title}</h2>
                  <button
                    className="studio-quiet"
                    onClick={() => setRoute("library")}
                  >
                    ✕
                  </button>
                </div>

                <p>
                  Configure your session. All tests are free. Sign in and submit at least 50% of the questions to save an attempt to your history.
                </p>

                <label className="studio-field">
                  Session Mode
                  <select
                    value={setupMode}
                    onChange={(e) => setSetupMode(e.target.value as any)}
                  >
                    <option value="practice">
                      Practice Mode — Flexible timing, solutions after submission
                    </option>
                    <option value="exam">
                      Official Exam Mode — Timed, solutions hidden until
                      submission
                    </option>
                  </select>
                </label>

                <label className="studio-field">
                  Test Section
                  <select
                    value={setupSection}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSetupSection(val === "all" ? "all" : Number(val));
                    }}
                  >
                    <option value="all">
                      Complete Test (All {selectedTestFull.parts.length}{" "}
                      sections)
                    </option>
                    {selectedTestFull.parts.map((p, idx) => (
                      <option key={idx} value={idx}>
                        Section {idx + 1}: {p.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="studio-field">
                  Time Limit
                  <select
                    disabled={setupMode === "exam"}
                    value={setupTime}
                    onChange={(e) => setSetupTime(Number(e.target.value))}
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={20}>
                      20 Minutes (Standard single passage)
                    </option>
                    <option value={60}>60 Minutes (Standard full test)</option>
                    <option value={0}>Untimed Practice</option>
                  </select>
                </label>

                <div className="studio-actions" style={{ marginTop: "20px" }}>
                  <button
                    className="studio-primary"
                    onClick={handleConfirmStartTest}
                  >
                    Start Session →
                  </button>
                  <button
                    className="studio-secondary"
                    onClick={() => setRoute("library")}
                  >
                    Cancel
                  </button>
                </div>
              </section>
            )}
          </React.Suspense>
        </main>
        </div>

        <footer className="studio-footer">
          <div>Reading Studio · Your next chapter starts here</div>
          <div>Made for focused, high-precision academic practice.</div>
        </footer>
      </div>

      {/* Hidden File Input for Admin Imports */}
      {userRole === "admin" && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.html,.htm,.json,.png,.jpg,.jpeg,.webp,.gif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) {
              handleUploadFiles(Array.from(e.target.files));
            }
            e.target.value = "";
          }}
        />
      )}

      {/* Profile / Target Band Modal */}
      {showProfileModal && (
        <dialog
          className="studio-modal"
          open
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 120,
          }}
        >
          <div className="studio-modal-heading">
            <h2>Your Study Profile</h2>
            <button
              className="studio-quiet"
              onClick={() => setShowProfileModal(false)}
            >
              ✕
            </button>
          </div>

          <label className="studio-field">
            Display Name
            <input
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </label>

          <label className="studio-field">
            Target IELTS Band Score (0 – 9)
            <input
              type="number"
              step="0.5"
              min="0"
              max="9"
              value={profile.target}
              onChange={(e) =>
                setProfile({ ...profile, target: Number(e.target.value) })
              }
            />
          </label>

          <div className="studio-actions" style={{ marginTop: "20px" }}>
            <button
              className="studio-primary"
              onClick={async () => {
                await handleUpdateProfile({
                  name: profile.name,
                  target: profile.target,
                });
                setShowProfileModal(false);
                notify("Profile updated.");
              }}
            >
              Save Profile
            </button>
            <button
              className="studio-secondary"
              onClick={() => setShowProfileModal(false)}
            >
              Cancel
            </button>
          </div>
        </dialog>
      )}

      {importPlan && userRole === "admin" && <ImportPreview plan={importPlan} existingIds={new Set(tests.map(t=>t.id))} onCancel={closeImportPreview} onConfirm={items=>void confirmImport(items)} />}
      {/* Upload Progress Modal */}
      {(uploadProgress || uploadReport) && (
        <dialog
          className="studio-modal"
          open
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 130,
          }}
        >
          <div className="studio-modal-heading">
            <h2>{uploadReport ? "Upload Report" : "Importing Tests"}</h2>
            {uploadReport && (
              <button
                className="studio-quiet"
                onClick={() => setUploadReport(null)}
              >
                ✕
              </button>
            )}
          </div>

          {uploadProgress && (
            <div className="studio-drop">
              <strong>{uploadProgress}</strong>
              <p>
                Unpacking ZIP archives, sanitizing markup, and verifying answer
                keys…
              </p>
            </div>
          )}

          {uploadReport && (
            <div>
              <p>
                <strong>{uploadReport.imported}</strong> tests imported or
                repaired · <strong>{uploadReport.duplicates}</strong> duplicates
                skipped.
              </p>

              {uploadReport.errors.length > 0 && (
                <div
                  className="studio-callout"
                  style={{ color: "#842f1f", background: "#faf0ed" }}
                >
                  <strong>
                    Issues Encountered ({uploadReport.errors.length}):
                  </strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
                    {uploadReport.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                style={{
                  marginTop: "16px",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  className="studio-primary"
                  onClick={() => setUploadReport(null)}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </dialog>
      )}

      {/* Toast Notification */}
      {toastMessage && <div className="toast visible">{toastMessage}</div>}
    </div>
  );
}

