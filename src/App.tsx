import {runMediaQueue,type QueueRow,type QueueResult} from './services/mediaQueue';
import {TeacherAccounts,TeacherAdminView} from './components/TeacherAccess';
import {importError,withImportTimeout,type ImportProgress} from './services/importProgress';
import {lookupVocabulary} from "./services/dictionary";
import {FolderPage} from "./components/FolderPage";
const WebsiteUISettings=React.lazy(()=>import('./components/WebsiteUISettings').then(m=>({default:m.WebsiteUISettings})));
import {defaultWebsiteUI,normalizeWebsiteUI} from './services/websiteUI';
import {requestJson} from './services/apiRequest';
import {TestSetup} from "./components/TestSetup";
import {directSession,examMinutes,setupLink} from "./services/sessionSettings";
import {SignInView} from "./components/SignInView";
import {Select} from "./components/Select";
import {testLink,resolveTestLink} from "./services/testLinks";
import {folderLocation,folderDeletion,trashFolders,restoreFolders,reconcileLibrary,organizationPatch,type LibraryFolder} from "./services/folders";
import {contentHash,mediaDigests,contentMatch} from "./services/importIdentity";
import {AdminSidebar} from './components/AdminSidebar';
import {ImportPreview} from './components/ImportPreview';
import {prepareImport,disposeImport,replaceImportAssets,type ImportPlan,type ImportCandidate} from './services/importPreview';
import { PortalHeader } from "./components/PortalHeader";
import { HomeView } from "./components/HomeView";
import { PracticeCatalog } from "./components/PracticeCatalog";
import { KnowledgeView, ContributionView, LoginNotice } from "./components/CommunityViews";
import { sectionSummaries } from "./services/portal";
const ContentAdminView = React.lazy(() => import("./components/ContentAdminView").then(m => ({default:m.ContentAdminView})));
import { createId } from "./services/ids";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { User } from "firebase/auth";
import {auth} from "./firebase";
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

  const setupBackground=useRef('/practice');
  useEffect(()=>{if(['practice','library','full','folder'].includes(route))setupBackground.current=location;},[route,location]);
  const catalogLocation=route==='test'?setupBackground.current:location;
  const catalogFolder=/^\/folders\/([^/?]+)/.exec(catalogLocation);
  const [authReady, setAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "local" | "syncing" | "synced" | "offline"
  >("local");
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [catalogLoaded,setCatalogLoaded]=useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [adminDataError, setAdminDataError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [activeDirectSlug,setActiveDirectSlug]=useState("");
  const [user, setUser] = useState<User | null>(null);
  const uploadCache=useRef(new Map<string,QueueResult>());
  const [queueRows,setQueueRows]=useState<QueueRow[]>([]);
  const [isTeacher,setIsTeacher]=useState(false);
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
        fontSize: 18,
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
        fontSize: 18,
        favorites: [],
        status: "active",
      };
    }
  });

  const [storedTests, setTests] = useState<TestMeta[]>([]);
  const {folders,tests}=useMemo(()=>reconcileLibrary(profile.libraryFolders||[],storedTests),[profile.libraryFolders,storedTests]);
  const folderSaving=useRef(false);
  const visibleCatalog=tests.map(t=>({...t,originSource:t.source,source:t.folderPath||"Unfiled"}));
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
  const [setupMode, setSetupMode] = useState<"practice" | "exam">("practice");
  const [setupTime, setSetupTime] = useState(60);
  const [setupSection, setSetupSection] = useState<"all" | number>("all");
  const [websiteUI,setWebsiteUI]=useState(defaultWebsiteUI);
  useEffect(()=>{const c=new AbortController();void fetch('/api/website-ui',{signal:c.signal}).then(r=>{if(!r.ok)throw Error('Settings unavailable');return r.json()}).then(s=>setWebsiteUI(normalizeWebsiteUI(s))).catch(()=>{});return()=>c.abort()},[]);
  const [selectedTestFull, setSelectedTestFull] = useState<EditableTest | null>(
    null,
  );

  // Upload progress modal
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [importProgress,setImportProgress]=useState<ImportProgress>({phase:'unpack',label:'Opening files',percent:0});
  const [importPlan,setImportPlan]=useState<ImportPlan|null>(null);
  const importPlanRef=useRef<ImportPlan|null>(null);
  const preparingImport=useRef(false);
  const importing=useRef(false);
  const closeImportPreview=()=>{uploadCache.current.clear();if(importPlanRef.current)disposeImport(importPlanRef.current);importPlanRef.current=null;setImportPlan(null);};
  useEffect(()=>()=>{if(importPlanRef.current)disposeImport(importPlanRef.current);},[]);
  const [uploadReport, setUploadReport] = useState<{
    imported: number;
    duplicates: number;
    errors: string[];audioOriginalBytes?:number;audioStoredBytes?:number;
  } | null>(null);

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSkillRef=useRef<'reading'|'listening'>('reading');

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
      setIsTeacher(state.teacher===true&&!state.suspended);
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
          fontSize: 18,
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
    if(current())setCatalogLoaded(true);
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
        if (page.name === "reading" && page.slug) {
          if(!catalogLoaded){setPageLoading(true);return;}if(catalogError)throw new Error(catalogError);
          const target=resolveTestLink(page.slug,tests);
          if(!target)throw new Error("This test link is unavailable. Find the test in the library.");
          setPageLoading(true);
          const full=await firestoreAdapter.getTestComplete(target.test.id);
          if(!alive)return;
          const section=target.section?(full.parts.find(p=>p.id===target.section!.id)||(!target.test.sectionSummaries?full.parts[target.section.index]:undefined)):null;
          if(target.section&&!section)throw new Error("This passage is unavailable.");
          const chosen=section?{...full,sourceTestId:full.id,sectionIds:[section.id],parts:[section],duration:full.skill==='listening'?10:full.duration,title:section.title}:full;
          const params=new URL(location,'https://studio.local').searchParams;
          if(!params.has('attempt')&&!page.solution){navigate(setupLink(full.id,section?.id),true);return;}
          const settings=directSession(params,chosen);setActiveTest(chosen);setActiveDirectSlug(page.slug);setActiveMode(settings.mode);setActiveDuration(settings.minutes);setActivePreview(false);
          const attempt=params.get("attempt");setSessionId("direct:"+target.test.id+":"+(target.section?.id||"all")+(attempt&&/^[\w-]{1,128}$/.test(attempt)?":"+attempt:""));
        } else if (page.name === "test" && page.id) {
          setPageLoading(true);
          setSelectedTestFull(null);
          const test = await firestoreAdapter.getTestComplete(page.id);
          if (!alive) return;
          if(page.solution){navigate(testLink(test,page.section?{id:page.section,title:test.parts.find(p=>p.id===page.section)?.title||test.title}:null,true),true);return;}
          setSelectedTestFull(test);
          setSetupMode("practice");
          setSetupTime(0);
          const sectionIndex = page.section ? test.parts.findIndex(p => p.id === page.section) : -1;
          if (page.section && sectionIndex < 0) throw new Error("This passage is unavailable.");
          setSetupSection(sectionIndex >= 0 ? sectionIndex : "all");

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
              source: "Unfiled",
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
  }, [location, authReady, profile.id, userRole, tests.length, catalogLoaded, catalogError]);
  useEffect(() => {
    document.title = `${route === "test" ? "Test details" : getCrumb()} · IELTS Studio`;
    if (!["workspace","reading"].includes(route)) setGuard(false);
  }, [location, setGuard]);
  useEffect(() => {
    document.body.classList.toggle(
      "hub-exam",
      Boolean(activeTest) && ((route === "reading" && activeDirectSlug===page.slug) || (route === "workspace" && page.session === sessionId)),
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
      const {libraryFolders,libraryFolderVersion,...personal}=updated;
      await firestoreAdapter.put("users", personal);
    }
  };

  // Vocabulary handlers
  const handleSaveWord = async (word: Partial<VocabularyItem>) => {
    if (!user) { notify(false ? "Đăng nhập để lưu từ vựng." : "Sign in to save vocabulary."); throw new Error("Sign in to save vocabulary."); }
    const owner=user.uid;
    if(!word.meaning?.trim())word={...word,...await lookupVocabulary(word.word||'',word.example||'')};
    if(previousUser.current!==owner)throw new Error('Your account changed. Please save the word again.');
    const duplicate=!word.id?vocabulary.find(item=>!item.archived&&item.word.toLowerCase()===word.word?.trim().toLowerCase()&&item.meaning===word.meaning?.trim()):undefined;
    const id = word.id || duplicate?.id || createId();
    const item: VocabularyItem = {
      id,
      owner: profile.id,
      word: word.word?.trim() || "",
      meaning: word.meaning?.trim() || "",
      example: word.example?.trim() || "",
      partOfSpeech: word.partOfSpeech || "term",
      dictionarySource: word.dictionarySource,
      definitionLanguage: word.definitionLanguage,
      phonetic: word.phonetic,
      archived: word.archived || false,
      createdAt: word.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await firestoreAdapter.put("vocabulary", item);
    if(previousUser.current!==owner)return;
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
    notify(`“${item.word}” saved to vocabulary.`);
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
    if(!preview&&!testToStart.sourceSections?.length){
      const parent={id:testToStart.sourceTestId||testToStart.id,title:testToStart.title};
      const section=testToStart.sectionIds?.length===1?{id:testToStart.sectionIds[0],title:testToStart.parts[0].title}:null;
      const path=testLink(parent,section);const params=new URLSearchParams();params.set('attempt',createId());if(modeToUse==='exam')params.set('mode','exam');if(modeToUse==='practice'&&durationMinutes>0)params.set('minutes',String(durationMinutes));navigate(path+(params.size?'?'+params:''));return;
    }
    const launchId = createId();
    const safe = {
      ...testToStart,
      parts: testToStart.parts.map((p) => ({
        ...p,
        passageHtml:testToStart.skill==='listening'?'':p.passageHtml,
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
        if(chosen.skill==='listening')chosen.duration=10;
        chosen.id = `${selectedTestFull.id}_part_${setupSection}`;
        chosen.title = `${selectedTestFull.title} — ${sectionPart.title}`;
      }
    }

    const duration = setupMode === "exam" ? examMinutes(chosen) : setupTime;
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
    await firestoreAdapter.saveTestComplete(testToSave,folders);
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

  const saveFolders=async(next:LibraryFolder[],unfiledIds:string[]=[])=>{
    if(userRole!=="admin")throw new Error("Administrator access required.");
    if(folderSaving.current)throw new Error("Wait for the current folder change to finish.");
    folderSaving.current=true;
    try{
      const version=await firestoreAdapter.saveLibraryFolders(next,profile.libraryFolderVersion||0);
      setProfile(prev=>({...prev,libraryFolders:next,libraryFolderVersion:version}));
      // Compare against stored metadata so recovered folder IDs are persisted too.
      const clearing=new Set(unfiledIds);
      const patches=tests.flatMap(test=>{
        const patch=organizationPatch(clearing.has(test.id)?{...test,folderId:null}:test,next),stored=storedTests.find(t=>t.id===test.id)!;
        return stored.folderId!==patch.folderId||(stored.folderPath||'')!==patch.folderPath||JSON.stringify(stored.fullTestMenuFolders||[])!==JSON.stringify(patch.fullTestMenuFolders)||JSON.stringify(stored.folderPages||[])!==JSON.stringify(patch.folderPages)?[{id:test.id,...patch}]:[];
      });
      await firestoreAdapter.updateTestOrganizations(patches);
      const updates=new Map(patches.map(p=>[p.id,p]));
      setTests(prev=>prev.map(t=>updates.has(t.id)?{...t,...updates.get(t.id)!}:t));
    }finally{folderSaving.current=false;}
  };
  const moveTests=async(ids:string[],id:string)=>{
    if(folderSaving.current)throw new Error("Wait for the folder menu to finish saving, then move tests.");
    const target=folderLocation(id,folders);
    if(id&&!target)throw new Error("Choose an existing folder.");
    await handleTestMeta(ids,organizationPatch({folderId:id||null} as TestMeta,folders));
    notify(ids.length+" tests moved to "+(target||"Unfiled")+".");
  };
  const deleteFolders=async(ids:string[],trashTests:boolean)=>{
    const affected=folderDeletion(folders,tests,ids);
    if(trashTests){
      const groups=new Map<string,string[]>();
      for(const test of tests.filter(t=>affected.testIds.includes(t.id)))groups.set(test.status,[...(groups.get(test.status)||[]),test.id]);
      for(const [restoreStatus,testIds]of groups)await handleTestMeta(testIds,{status:"archived",deletedAt:Date.now(),restoreStatus});
    }
    await saveFolders(trashFolders(folders,affected.folderIds),trashTests?[]:affected.testIds);
    notify("Folders moved to Deleted folders.");
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
    if(test.folderId&&!folderLocation(test.folderId,folders))await saveFolders(restoreFolders(folders,test.folderId));
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
  const handleUploadFiles = async (files: File[],skill?:'reading'|'listening') => {
    if (!files.length || userRole !== "admin" || preparingImport.current || importing.current) return;
    preparingImport.current=true;
    setImportProgress({phase:'unpack',label:'Opening files',percent:0});
    setUploadProgress("Preparing local preview…");setUploadReport(null);
    try {
      const plan=await prepareImport(files,skill||uploadSkillRef.current,setImportProgress);
      const seen=new Map<string,{title:string;folder:string}>();
      for(const candidate of plan.candidates){const match=contentMatch(candidate.test.contentHash||"",tests);candidate.match=match?{title:match.title,folder:match.folderPath||"Unfiled"}:seen.get(candidate.test.contentHash||"");seen.set(candidate.test.contentHash||"",{title:candidate.test.title,folder:"this upload"});}
      closeImportPreview();importPlanRef.current=plan;setImportPlan(plan);
    }catch(error){setUploadReport({imported:0,duplicates:0,errors:['Preparing ZIP preview: '+importError(error)]});}
    finally{preparingImport.current=false;setUploadProgress(null);}
  };
  const confirmImport=async (items:ImportCandidate[])=>{
    const plan=importPlanRef.current;
    if(!plan||userRole!=="admin"||importing.current||!items.length)return;
    importing.current=true;setQueueRows([]);setImportPlan(null);setUploadProgress("Uploading test media…");
    setImportProgress({phase:'verify',label:'Checking selected media',percent:0});
    let currentStep='Checking selected media';let audioOriginalBytes=0,audioStoredBytes=0;
    let imported=0,duplicates=items.filter(item=>item.match).length,completed=false;
    const savedIds=new Set<string>();
    const errors=[...plan.errors];
    try {
      const digests=await mediaDigests([...plan.images,...(plan.recordings||[])],(done,total)=>setImportProgress({phase:'verify',label:'Checking selected media',percent:5*done/Math.max(1,total)}));
      for(const item of items)item.test.contentHash=await contentHash(item.test,digests);
      const assets=new Map<string,string>(),audioNames=new Map<string,string>(),audioSizes=new Map<string,number>();
      const selectedContent=JSON.stringify(items);
      const media=[...plan.images,...(plan.recordings||[])].filter(image=>selectedContent.includes(image.url));
      const audioUrls=new Set(plan.recordings?.map(r=>r.url)||[]);
      const {compressListeningAudio}=await import('./services/audioCompression');
      const uploadPaths=new Map<string,string>();
      setUploadProgress('Processing upload queue');
      const {results,failures}=await runMediaQueue(media.map(image=>({...image,audio:audioUrls.has(image.url),digest:digests.get(image.url)||image.url})),{
        compressionConcurrency:(navigator as Navigator&{deviceMemory?:number}).deviceMemory&&((navigator as Navigator&{deviceMemory?:number}).deviceMemory||0)<4?1:(navigator.hardwareConcurrency||2)>=4?2:1,
        uploadConcurrency:3,cache:uploadCache.current,
        compress:async(job,progress)=>{const result=await compressListeningAudio(job.blob,job.name,p=>progress(p));return {blob:result.blob,name:result.name}},
        upload:async(job,blob,name,progress)=>{
          let path=uploadPaths.get(job.url);if(!path){path=job.audio?`media/audio/96k-v1/${job.digest}.${name.split('.').pop()}`:`media/${createId()}-${name.split('/').pop()}`;uploadPaths.set(job.url,path);}
          const existing=job.audio?await firestoreAdapter.existingMedia(path):null;
          return existing||await firestoreAdapter.uploadMedia(blob,path,(sent,total)=>progress(100*sent/Math.max(1,total)));
        },
        onProgress:rows=>{setQueueRows(rows);const done=rows.filter(r=>r.phase==='complete'||r.phase==='failed').length;setImportProgress({phase:'upload',label:`${done} / ${rows.length} files processed`,percent:5+80*rows.reduce((sum,r)=>sum+r.percent,0)/Math.max(1,rows.length)})}
      });
      for(const image of media){const result=results.get(image.url);if(!result){errors.push(image.name+': '+failures.get(image.url));continue}assets.set(image.url,result.url);if(audioUrls.has(image.url)){audioSizes.set(image.url,result.size);audioNames.set(image.url,result.name);audioOriginalBytes+=image.blob.size;audioStoredBytes+=result.size}}
      const failedItems=items.filter(item=>[...failures.keys()].some(url=>JSON.stringify(item.test).includes(url)));
      for(const item of failedItems)errors.push(item.name+': not saved because a required media file failed. Retry this test from the preview.');
      const readyItems=items.filter(item=>!failedItems.includes(item));
      const candidates=readyItems.map(c=>({...c,test:replaceImportAssets({...c.test,parts:c.test.parts.map(p=>({...p,...(p.audio&&audioNames.has(p.audio)?{audioName:audioNames.get(p.audio)}:{})})),audioFiles:c.test.audioFiles?.map(file=>({...file,name:audioNames.get(file.url)||file.name,size:audioSizes.get(file.url)||file.size}))},assets)}));
      // 3. Save candidates to Firestore with duplicate detection
      for (const [idx, item] of candidates.entries()) {
        setUploadProgress(`Saving test ${idx + 1} of ${candidates.length}…`);
        try {
          currentStep='Saving '+item.test.title;
          setImportProgress({phase:'save',label:`Saving test ${idx+1} of ${candidates.length}`,percent:85+15*idx/Math.max(1,candidates.length),detail:item.test.title});
          await withImportTimeout(firestoreAdapter.saveTestComplete(item.test,folders),'Saving '+item.test.title);
          imported++;savedIds.add(item.test.id);
        } catch (saveErr) {
          if((saveErr as {code?:string}).code==='import/save-timeout')throw saveErr;
          failedItems.push(item);
          errors.push(
            `${item.name}: saving test: ${importError(saveErr)}`,
          );
        }
      }

      setImportProgress({phase:'save',label:'Import complete',percent:100});
      setUploadReport({ imported, duplicates, errors,audioOriginalBytes,audioStoredBytes });
      if(failedItems.length){plan.candidates=failedItems;completed=false;}else completed=true;
      await loadData();
      notify(
        `Import complete: ${imported} imported, ${duplicates} content matches kept as new copies.`,
      );
    } catch (topErr) {
      plan.candidates=items.filter(item=>!savedIds.has(item.test.id));
      // Keep the preview hidden until the error report is dismissed.
      setUploadReport({imported,duplicates,errors:[...errors,currentStep+': '+importError(topErr)]});
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
  if(isTeacher&&['admin','students','editor','content-admin','contributions-admin'].includes(route))return <TeacherAdminView onNavigate={navigate}/>;
  if (activeTest && !pageLoading && !pageError && ((route === "reading" && activeDirectSlug===page.slug) || (route === "workspace" && page.session === sessionId))) {
    return (
      <>
        {pendingNavigation && (
          <LeaveTestDialog
            onStay={cancelNavigation}
            onLeave={confirmNavigation}
          />
        )}
        <TestWorkspace
          key={`${profile.id}:${sessionId}:${activeMode}:${activeDuration}:${page.solution ? "solution" : "test"}`}
          onRetake={()=>handleStartSession(activeTest,'practice',0)}
          initialSolution={page.name === "reading" && Boolean(page.solution)}
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
        {toastMessage && <div className="toast visible" role="status" aria-live="polite">{toastMessage}</div>}
      </>
    );
  }

  const loadCatalogSummary=async(test:TestMeta)=>{const patch=await firestoreAdapter.getCatalogSummary(test);setTests(previous=>previous.map(item=>item.id===test.id?{...item,...patch}:item));return patch;};

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
        <PortalHeader settings={websiteUI} tests={tests} route={route} user={user} profile={profile} role={isTeacher?'teacher':userRole} onNavigate={navigate} onUpdateProfile={handleUpdateProfile} onOpenProfileModal={() => setRoute("settings")} />

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
            {catalogError && ["library", "practice", "full", "folder"].includes(route) && (
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
            {route === "sign-in" && <SignInView location={location} onNavigate={navigate}/>}
            {route === "home" && authReady && <HomeView settings={websiteUI} tests={visibleCatalog} attempts={attempts} profile={profile} onNavigate={navigate} onUpdateProfile={handleUpdateProfile} />}
            {route==='folder'&&<FolderPage id={route==='folder'?page.id||'':decodeURIComponent(catalogFolder![1])} folders={folders} tests={visibleCatalog} profile={profile} attempts={attempts} location={catalogLocation} onNavigate={navigate} loading={!catalogLoaded} loadSummary={loadCatalogSummary}/>}
            {["library", "practice", "full"].includes(route) && !(route==='test'&&catalogFolder) && <PracticeCatalog folders={folders} tests={visibleCatalog} profile={profile} attempts={attempts} full={route === "full"||(route==='test'&&setupBackground.current.startsWith('/full-tests'))} category={page.category} location={route==='test'?setupBackground.current:location} onNavigate={navigate} loadSummary={loadCatalogSummary} />}



            {["content-admin", "contributions-admin"].includes(route) && userRole === "admin" && <ContentAdminView key={route} contributions={route === "contributions-admin"} onUploadFiles={handleUploadFiles} />}
            {["progress", "vocabulary"].includes(route) && !user && <LoginNotice vi={false} text={false ? "Đăng nhập để lưu từ vựng, điểm và lịch sử làm bài. Mọi đề đều miễn phí, không cần đăng nhập để luyện tập." : "Sign in to save vocabulary, scores and history. All tests are free and open to guests."} />}

            {route === "mock" && (
              <MockBuilderView
                tests={visibleCatalog}
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
                onOpenUpload={(skill?:'reading'|'listening') => {uploadSkillRef.current=skill||'reading';fileInputRef.current?.click();}}
                onNotify={notify}
              />
            )}

            {route === "students" && userRole === "admin" && (
              <StudentsView
                onToggleStatus={handleToggleLearnerStatus}
                onDeleted={uid=>setLearners(previous=>previous.filter(p=>p.id!==uid))}
                learners={learners.filter(p=>!p.deletedAt)}
                studentId={page.id}
                attemptId={page.attempt}
                onNavigate={navigate}
              />
            )}
            {route === "admin" && page.section === "website-ui" && userRole === "admin" && <WebsiteUISettings settings={websiteUI} folders={folders} tests={tests} onFolders={saveFolders} onSave={async value=>{const saved=await requestJson("/api/admin/website-ui",value,()=>auth.currentUser);setWebsiteUI(normalizeWebsiteUI(saved));}}/>}
            {route === "admin" && page.section === "teachers" && userRole === "admin" && <TeacherAccounts/>}
            {route === "admin" && !["website-ui","teachers"].includes(page.section||"") && userRole === "admin" && (
              <AdminView
                key={page.section || "overview"}
                section={page.section || "overview"}
                onNavigate={navigate}
                tests={tests}
                reports={reports}
                learners={learners.filter(p=>!p.deletedAt)}
                adminUid={user?.uid || ""}
                onNewTest={handleNewTest}
                onPermanentDelete={async ids=>{try{for(let i=0;i<ids.length;i+=25){notify(`Permanently deleting tests ${i+1}–${Math.min(i+25,ids.length)} of ${ids.length}…`);await requestJson("/api/admin/trash-delete",{testIds:ids.slice(i,i+25),confirm:"DELETE"},()=>auth.currentUser);}notify("Tests and their unused media permanently deleted.");}finally{await loadData();}}}
                onDeleteTest={handleDeleteTest}
                folders={folders}
                onFolderChange={saveFolders}
                onDeleteFolders={deleteFolders}
                onRestoreTest={handleRestoreTest}
                onSetCollection={moveTests}
                onRenameTest={(id,title)=>handleTestMeta([id],{title})}
                onDuplicateTest={async id=>{
                  const original=await firestoreAdapter.getTestComplete(id);
                  const {sourceTestId,sectionIds,sourceSections,...copy}=original;
                  const duplicate={...copy,id:`test_${createId()}`,title:`${copy.title} (copy)`.slice(0,250),status:"draft" as const,access:"free" as const,createdAt:Date.now(),updatedAt:Date.now()};
                  await firestoreAdapter.saveTestComplete(duplicate,folders);
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
                onOpenUpload={(skill?:'reading'|'listening') => {uploadSkillRef.current=skill||'reading';fileInputRef.current?.click();}}
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
                  folders={folders}
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
              <TestSetup attempts={attempts} test={selectedTestFull} mode={setupMode} minutes={setupTime} section={setupSection} onMode={setSetupMode} onMinutes={setSetupTime} onSection={setSetupSection} onStart={handleConfirmStartTest} onClose={()=>navigate(setupBackground.current)}/>
            )}
          </React.Suspense>
        </main>
        </div>

        <footer className="studio-footer">
          <div>IELTS studio</div>
          <div>Reading & Listening practice</div>
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

      {importPlan && userRole === "admin" && <ImportPreview plan={importPlan} folders={folders} tests={tests} onSaveFolders={saveFolders} onCancel={closeImportPreview} onConfirm={items=>void confirmImport(items)} />}
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
                onClick={() => {setUploadReport(null);if(importPlanRef.current)setImportPlan(importPlanRef.current);}}
              >
                ✕
              </button>
            )}
          </div>

          {uploadProgress && (
            <div className="studio-drop">
              <strong>{uploadProgress}</strong>
              <div className="import-progress-track"><progress aria-label="Import progress" max={100} value={importProgress.percent}/><strong>{Math.floor(importProgress.percent)}%</strong></div>
              <p role="status">{importProgress.label}</p><p className="import-progress-file">{importProgress.detail}</p>
              {queueRows.length>0&&<section aria-label="File upload queue" style={{maxHeight:'32vh',overflowY:'auto',textAlign:'left'}}>{queueRows.map(row=><div key={row.id} style={{padding:'9px 0',borderBottom:'1px solid #ddd'}}><strong style={{fontSize:12,overflowWrap:'anywhere'}}>{row.name}</strong><div style={{display:'flex',alignItems:'center',gap:10}}><progress aria-label={row.name+' progress'} max={100} value={row.percent}/><span style={{fontSize:11}}>{row.phase}{row.attempt>1?' · retry '+(row.attempt-1):''}</span></div>{row.error&&<small role="alert">{row.error}</small>}</div>)}</section>}
              <p>Up to 2 recordings compress and 3 files upload at once. Large audio files can take a few minutes. A stalled upload stops with a diagnostic error after 120 seconds without progress.</p>
            </div>
          )}

          {uploadReport && (
            <div>
              <p>
                <strong>{uploadReport.imported}</strong> tests imported · <strong>{uploadReport.duplicates}</strong> content matches imported as copies.
              </p>

              {!!uploadReport.audioOriginalBytes&&<p>Audio size: {(uploadReport.audioOriginalBytes/1048576).toFixed(1)} MB to {((uploadReport.audioStoredBytes||0)/1048576).toFixed(1)} MB ({Math.round(100*(1-(uploadReport.audioStoredBytes||0)/uploadReport.audioOriginalBytes))}% smaller).</p>}
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
                  </ul><label>Copyable error details<textarea className="import-error-details" aria-label="Upload error details" readOnly value={uploadReport.errors.join('\n')} onFocus={e=>e.target.select()}/></label><button className="studio-secondary" onClick={()=>void navigator.clipboard.writeText(uploadReport.errors.join('\n')).then(()=>notify('Error details copied.')).catch(()=>notify('Select the error details and copy them.'))}>Copy error details</button>
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
                  onClick={() => {setUploadReport(null);if(importPlanRef.current)setImportPlan(importPlanRef.current);}}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </dialog>
      )}

      {/* Toast Notification */}
      {toastMessage && <div className="toast visible" role="status" aria-live="polite">{toastMessage}</div>}
    </div>
  );
}

