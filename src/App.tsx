import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import { subscribeAuth, loginWithGoogle } from './services/auth';
import { firestoreAdapter } from './services/firestoreAdapter';
import {
  TestMeta,
  EditableTest,
  UserProfile,
  AttemptRecord,
  VocabularyItem,
  ContentReport,
} from './types';
import { collectFiles, jsonParts, toEditable, extractTitle, fingerprint } from './services/importer';

import { Navigation } from './components/Navigation';
import { TopHeader } from './components/TopHeader';
import { LibraryView } from './components/LibraryView';
import { MockBuilderView } from './components/MockBuilderView';
import { ProgressView } from './components/ProgressView';
import { VocabularyView } from './components/VocabularyView';
import { SettingsView } from './components/SettingsView';
import { AdminView } from './components/AdminView';
import { TestEditorView } from './components/TestEditorView';
import { TestWorkspace } from './components/TestWorkspace';

export default function App() {
  const [route, setRoute] = useState<'library' | 'mock' | 'progress' | 'vocabulary' | 'settings' | 'admin' | 'editor' | 'workspace'>('library');
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'student'>('student');
  const [suspended, setSuspended] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    id: 'guest',
    email: '',
    name: 'Learner',
    target: 7.5,
    language: 'en',
    theme: 'light',
    fontSize: 16,
    favorites: [],
    status: 'active',
  });

  const [tests, setTests] = useState<TestMeta[]>([]);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [learners, setLearners] = useState<UserProfile[]>([]);

  // Active test workspace state
  const [activeTest, setActiveTest] = useState<EditableTest | null>(null);
  const [activeMode, setActiveMode] = useState<'practice' | 'exam'>('practice');
  const [activeDuration, setActiveDuration] = useState(60);

  // Active test editor state
  const [editingTest, setEditingTest] = useState<EditableTest | null>(null);

  // Dialog & modal states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showTestSetupModal, setShowTestSetupModal] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<'practice' | 'exam'>('practice');
  const [setupTime, setSetupTime] = useState(60);
  const [setupSection, setSetupSection] = useState<'all' | number>('all');
  const [selectedTestFull, setSelectedTestFull] = useState<EditableTest | null>(null);

  // Upload progress modal
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadReport, setUploadReport] = useState<{ imported: number; duplicates: number; errors: string[] } | null>(null);

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 5000);
  }, []);

  // Subscribe to Authentication state
  useEffect(() => {
    const unsubscribe = subscribeAuth((state) => {
      setUser(state.user);
      setUserRole(state.role);
      setSuspended(state.suspended);
      if (state.profile) {
        setProfile(state.profile);
      }
    });
    return unsubscribe;
  }, []);

  // Sync theme, font size, language with document root
  useEffect(() => {
    document.body.classList.toggle('studio-dark', profile.theme === 'dark');
    document.documentElement.style.setProperty('--study-font-size', `${profile.fontSize}px`);
    document.documentElement.lang = profile.language;
  }, [profile.theme, profile.fontSize, profile.language]);

  // Load catalog, attempts, vocabulary, and admin collections
  const loadData = useCallback(async () => {
    try {
      // 1. Fetch lightweight test catalog
      const { tests: fetchedTests } = await firestoreAdapter.listTests({ pageSize: 100 });
      setTests(fetchedTests);

      // 2. Fetch attempts
      if (user) {
        const userAttempts = await firestoreAdapter.list('attempts');
        setAttempts(userAttempts as AttemptRecord[]);

        // 3. Fetch vocabulary
        const userVocab = await firestoreAdapter.list('vocabulary');
        setVocabulary(userVocab as VocabularyItem[]);

        // 4. If admin, load reports & learners
        if (userRole === 'admin') {
          const reportsList = await firestoreAdapter.list('reports');
          setReports(reportsList as ContentReport[]);

          const learnersList = await firestoreAdapter.list('users');
          setLearners(learnersList as UserProfile[]);
        }
      }
    } catch (err) {
      console.warn('Initial data load notice:', err);
    }
  }, [user, userRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Profile update handler
  const handleUpdateProfile = async (updates: Partial<UserProfile>) => {
    const updated = { ...profile, ...updates };
    setProfile(updated);
    if (user) {
      await firestoreAdapter.put('users', updated);
    }
  };

  // Vocabulary handlers
  const handleSaveWord = async (word: Partial<VocabularyItem>) => {
    const id = word.id || `voc_${Date.now()}`;
    const item: VocabularyItem = {
      id,
      owner: profile.id,
      word: word.word?.trim() || '',
      meaning: word.meaning?.trim() || '',
      example: word.example?.trim() || '',
      partOfSpeech: word.partOfSpeech || 'noun',
      archived: word.archived || false,
      createdAt: word.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await firestoreAdapter.put('vocabulary', item);
    setVocabulary((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [item, ...prev];
    });
  };

  const handleArchiveWord = async (wordId: string) => {
    const target = vocabulary.find((w) => w.id === wordId);
    if (target) {
      const updated = { ...target, archived: true };
      await firestoreAdapter.put('vocabulary', updated);
      setVocabulary((prev) => prev.map((w) => (w.id === wordId ? updated : w)));
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
  const handleStartSession = (testToStart: EditableTest, modeToUse: 'practice' | 'exam', durationMinutes: number) => {
    setActiveTest(testToStart);
    setActiveMode(modeToUse);
    setActiveDuration(durationMinutes);
    setRoute('workspace');
    document.body.classList.add('hub-exam');
  };

  // Open Test Selection Dialog
  const handleSelectTest = async (testId: string) => {
    try {
      notify('Loading test details…');
      const fullTest = await firestoreAdapter.getTestComplete(testId);
      setSelectedTestId(testId);
      setSelectedTestFull(fullTest);
      setSetupMode('practice');
      setSetupTime(fullTest.duration || 60);
      setSetupSection('all');
      setShowTestSetupModal(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmStartTest = () => {
    if (!selectedTestFull) return;
    setShowTestSetupModal(false);

    let chosen = JSON.parse(JSON.stringify(selectedTestFull)) as EditableTest;
    if (setupSection !== 'all') {
      const sectionPart = chosen.parts[setupSection];
      if (sectionPart) {
        chosen.parts = [sectionPart];
        chosen.id = `${selectedTestFull.id}_part_${setupSection}`;
        chosen.title = `${selectedTestFull.title} — ${sectionPart.title}`;
      }
    }

    const duration = setupMode === 'exam' ? (chosen.duration || 60) : setupTime;
    handleStartSession(chosen, setupMode, duration);
  };

  // Admin New Test
  const handleNewTest = () => {
    const newTest: EditableTest = {
      schemaVersion: 1,
      id: `test_${Date.now()}`,
      title: 'New IELTS Test',
      skill: 'reading',
      source: 'Internal Authoring',
      access: 'free',
      status: 'draft',
      duration: 60,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parts: [
        {
          id: 'p0',
          title: 'Passage 1',
          passageHtml: '<h2>Reading Passage Title</h2><p>Write or paste your reading passage here.</p>',
          questionHtml: '<h3>Questions 1–13</h3><p>Read the passage and answer the questions below.</p>',
          slots: {},
          questions: [],
          audio: '',
        },
      ],
    };
    setEditingTest(newTest);
    setRoute('editor');
  };

  // Admin Edit Test
  const handleEditTest = async (testId: string) => {
    try {
      notify('Loading test editor…');
      const fullTest = await firestoreAdapter.getTestComplete(testId);
      setEditingTest(fullTest);
      setRoute('editor');
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    }
  };

  // Admin Save Test
  const handleSaveTest = async (testToSave: EditableTest, status: 'published' | 'draft') => {
    testToSave.status = status;
    await firestoreAdapter.saveTestComplete(testToSave);
    await loadData();
  };

  // Admin Archive Toggle
  const handleArchiveToggle = async (testId: string) => {
    const fullTest = await firestoreAdapter.getTestComplete(testId);
    const newStatus = fullTest.status === 'archived' ? 'draft' : 'archived';
    fullTest.status = newStatus;
    await firestoreAdapter.saveTestComplete(fullTest);
    notify(`Test marked as ${newStatus}.`);
    await loadData();
  };

  // Admin Export Single Test
  const handleExportTest = async (testId: string) => {
    const fullTest = await firestoreAdapter.getTestComplete(testId);
    const blob = new Blob([JSON.stringify(fullTest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fullTest.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify('Test JSON exported.');
  };

  // Admin Export Complete Test Bank
  const handleExportBank = async () => {
    notify('Preparing complete test bank export…');
    const fullBank: EditableTest[] = [];
    for (const meta of tests) {
      const full = await firestoreAdapter.getTestComplete(meta.id);
      fullBank.push(full);
    }
    const backup = {
      format: 'ielts-studio-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      tests: fullBank,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IELTS_Test_Bank_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify(`${fullBank.length} tests exported.`);
  };

  // Admin Toggle Report Status
  const handleToggleReportStatus = async (report: ContentReport) => {
    const newStatus = report.status === 'resolved' ? 'open' : 'resolved';
    const updated = { ...report, status: newStatus as any };
    await firestoreAdapter.put('reports', updated);
    setReports((prev) => prev.map((r) => (r.id === report.id ? updated : r)));
    notify(`Report marked as ${newStatus}.`);
  };

  // Admin Toggle Learner Status
  const handleToggleLearnerStatus = async (targetUserId: string, newStatus: 'active' | 'suspended') => {
    const res = await fetch('/api/admin/user-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId,
        newStatus,
        adminUid: user?.uid,
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to update learner status on server.');
    }
    setLearners((prev) =>
      prev.map((l) => (l.id === targetUserId ? { ...l, status: newStatus } : l))
    );
  };

  // Admin Upload Files Handler (ZIP, HTML, JSON)
  const handleUploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploadProgress('Analyzing and unpacking files…');
    setUploadReport(null);

    let imported = 0;
    let duplicates = 0;
    const errors: string[] = [];
    const candidates: { test: EditableTest; name: string }[] = [];

    try {
      // 1. JSON test files
      for (const file of files.filter((f) => /\.json$/i.test(f.name))) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          const testsToImport = Array.isArray(data)
            ? data
            : data.format === 'ielts-studio-backup'
            ? data.tests
            : [data];

          for (let item of testsToImport) {
            if (item.parts?.[0]?.topic_content) {
              item = toEditable(item);
            }
            candidates.push({ test: item, name: file.name });
          }
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 2. ZIP and HTML files
      const nonJsonFiles = files.filter((f) => !/\.json$/i.test(f.name));
      if (nonJsonFiles.length > 0) {
        const { candidates: htmlCandidates, images, errors: parseErrors } = await collectFiles(nonJsonFiles);
        errors.push(...parseErrors);

        // Upload any diagrams/images to Firebase Storage
        for (const img of images) {
          try {
            await firestoreAdapter.uploadMedia(img.blob, `media/${img.name}`);
          } catch {
            // ignore
          }
        }

        // Parse HTML candidates
        for (const c of htmlCandidates) {
          try {
            const rawParts = jsonParts(c.source);
            const title = extractTitle(c.source, c.name);
            const editable = toEditable({ title, parts: rawParts });
            candidates.push({ test: editable, name: c.name });
          } catch (err) {
            errors.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      // 3. Save candidates to Firestore with duplicate detection
      for (const [idx, item] of candidates.entries()) {
        setUploadProgress(`Saving test ${idx + 1} of ${candidates.length}…`);
        try {
          const isDuplicate = tests.some((t) => t.id === item.test.id || t.title === item.test.title);
          if (isDuplicate) {
            duplicates++;
            continue;
          }
          await firestoreAdapter.saveTestComplete(item.test);
          imported++;
        } catch (saveErr) {
          errors.push(`${item.name}: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
        }
      }

      setUploadReport({ imported, duplicates, errors });
      await loadData();
      notify(`Import complete: ${imported} added, ${duplicates} duplicates skipped.`);
    } catch (topErr) {
      notify('Upload failed: ' + (topErr instanceof Error ? topErr.message : String(topErr)));
    } finally {
      setUploadProgress(null);
    }
  };

  // Breadcrumb generation
  const getCrumb = () => {
    switch (route) {
      case 'library':
        return profile.language === 'vi' ? 'Thư viện đề thi' : 'Test library';
      case 'mock':
        return profile.language === 'vi' ? 'Thi thử đầy đủ' : 'Full mock test';
      case 'progress':
        return profile.language === 'vi' ? 'Tiến độ của tôi' : 'My progress';
      case 'vocabulary':
        return profile.language === 'vi' ? 'Sổ từ vựng' : 'Vocabulary notebook';
      case 'settings':
        return profile.language === 'vi' ? 'Cài đặt & dữ liệu' : 'Settings & data';
      case 'admin':
        return profile.language === 'vi' ? 'Quản trị nội dung' : 'Content administration';
      case 'editor':
        return 'Test Editor';
      case 'workspace':
        return activeTest?.title || 'Exam workspace';
      default:
        return 'Reading Studio';
    }
  };

  // If in active test workspace:
  if (route === 'workspace' && activeTest) {
    return (
      <>
        <TestWorkspace
          test={activeTest}
          mode={activeMode}
          initialDurationMinutes={activeDuration}
          profile={profile}
          onReturnToLibrary={() => {
            document.body.classList.remove('hub-exam');
            setRoute('library');
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
      {/* Sidebar Navigation */}
      <Navigation
        route={route}
        onNavigate={(newRoute) => {
          if (newRoute === 'admin' && userRole !== 'admin') {
            notify('Administrator access required.');
            return;
          }
          setRoute(newRoute as any);
        }}
        isAdmin={userRole === 'admin'}
        profile={profile}
        storageConnected={Boolean(user)}
      />

      {/* Main Content Area */}
      <div className="studio-main">
        <TopHeader
          crumb={getCrumb()}
          user={user}
          profile={profile}
          role={userRole}
          onUpdateProfile={handleUpdateProfile}
          onOpenProfileModal={() => setShowProfileModal(true)}
        />

        {/* Account Suspension Alert */}
        {suspended && (
          <div
            style={{
              padding: '12px 36px',
              background: '#faf0ed',
              borderBottom: '1px solid #e8c8c0',
              color: '#842f1f',
              fontSize: '13px',
            }}
          >
            <strong>Account Notice:</strong> Your student account is currently suspended. Practice
            history and vocabulary saves are disabled. Contact an administrator to restore access.
          </div>
        )}

        <main id="studioContent">
          {route === 'library' && (
            <LibraryView
              tests={tests}
              attempts={attempts}
              profile={profile}
              onSelectTest={handleSelectTest}
              onToggleFavorite={handleToggleFavorite}
              onNavigateToMock={() => setRoute('mock')}
              onNavigateToAdmin={() => setRoute('admin')}
            />
          )}

          {route === 'mock' && (
            <MockBuilderView
              tests={tests}
              onStartSession={handleStartSession}
              onNotify={notify}
            />
          )}

          {route === 'progress' && (
            <ProgressView
              attempts={attempts}
              profile={profile}
              onOpenProfileModal={() => setShowProfileModal(true)}
              onReopenAttempt={(att) => {
                const def = att.definition || tests.find((t) => t.id === att.testId);
                if (def) {
                  firestoreAdapter.getTestComplete(def.id).then((fullTest) => {
                    handleStartSession(fullTest, 'practice', 0);
                  });
                }
              }}
            />
          )}

          {route === 'vocabulary' && (
            <VocabularyView
              vocabulary={vocabulary}
              profile={profile}
              onSaveWord={handleSaveWord}
              onArchiveWord={handleArchiveWord}
              onNotify={notify}
            />
          )}

          {route === 'settings' && (
            <SettingsView
              profile={profile}
              attempts={attempts}
              vocabulary={vocabulary}
              isAdmin={userRole === 'admin'}
              onUpdateProfile={handleUpdateProfile}
              onExportTestBank={handleExportBank}
              onOpenUpload={() => fileInputRef.current?.click()}
              onNotify={notify}
            />
          )}

          {route === 'admin' && userRole === 'admin' && (
            <AdminView
              tests={tests}
              reports={reports}
              learners={learners}
              adminUid={user?.uid || ''}
              onNewTest={handleNewTest}
              onEditTest={handleEditTest}
              onExportTest={handleExportTest}
              onArchiveToggle={handleArchiveToggle}
              onExportBank={handleExportBank}
              onOpenUpload={() => fileInputRef.current?.click()}
              onToggleReportStatus={handleToggleReportStatus}
              onToggleLearnerStatus={handleToggleLearnerStatus}
              onNotify={notify}
            />
          )}

          {route === 'editor' && editingTest && (
            <TestEditorView
              test={editingTest}
              onSave={async (savedTest, status) => {
                await handleSaveTest(savedTest, status);
                setRoute('admin');
              }}
              onPreview={(testToPreview) => {
                handleStartSession(testToPreview, 'practice', 0);
              }}
              onClose={() => setRoute('admin')}
              onNotify={notify}
            />
          )}
        </main>

        <footer className="studio-footer">
          <div>Reading Studio — IELTS Library & Admin</div>
          <div>Made for focused, high-precision academic practice.</div>
        </footer>
      </div>

      {/* Hidden File Input for Admin Imports */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.html,.htm,.json"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) {
            handleUploadFiles(Array.from(e.target.files));
          }
          e.target.value = '';
        }}
      />

      {/* Test Setup / Launch Modal */}
      {showTestSetupModal && selectedTestFull && (
        <dialog
          className="studio-modal"
          open
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 120 }}
        >
          <div className="studio-modal-heading">
            <h2>{selectedTestFull.title}</h2>
            <button className="studio-quiet" onClick={() => setShowTestSetupModal(false)}>
              ✕
            </button>
          </div>

          <p>Configure your practice session. Your progress will be saved across all devices.</p>

          <label className="studio-field">
            Session Mode
            <select
              value={setupMode}
              onChange={(e) => setSetupMode(e.target.value as any)}
            >
              <option value="practice">Practice Mode — Flexible timing & independent answer toggles</option>
              <option value="exam">Official Exam Mode — Timed, solutions hidden until submission</option>
            </select>
          </label>

          <label className="studio-field">
            Test Section
            <select
              value={setupSection}
              onChange={(e) => {
                const val = e.target.value;
                setSetupSection(val === 'all' ? 'all' : Number(val));
              }}
            >
              <option value="all">Complete Test (All {selectedTestFull.parts.length} sections)</option>
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
              disabled={setupMode === 'exam'}
              value={setupTime}
              onChange={(e) => setSetupTime(Number(e.target.value))}
            >
              <option value={15}>15 Minutes</option>
              <option value={20}>20 Minutes (Standard single passage)</option>
              <option value={60}>60 Minutes (Standard full test)</option>
              <option value={0}>Untimed Practice</option>
            </select>
          </label>

          <div className="studio-actions" style={{ marginTop: '20px' }}>
            <button className="studio-primary" onClick={handleConfirmStartTest}>
              Start Session →
            </button>
            <button className="studio-secondary" onClick={() => setShowTestSetupModal(false)}>
              Cancel
            </button>
          </div>
        </dialog>
      )}

      {/* Profile / Target Band Modal */}
      {showProfileModal && (
        <dialog
          className="studio-modal"
          open
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 120 }}
        >
          <div className="studio-modal-heading">
            <h2>Your Study Profile</h2>
            <button className="studio-quiet" onClick={() => setShowProfileModal(false)}>
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
              onChange={(e) => setProfile({ ...profile, target: Number(e.target.value) })}
            />
          </label>

          <div className="studio-actions" style={{ marginTop: '20px' }}>
            <button
              className="studio-primary"
              onClick={async () => {
                await handleUpdateProfile({ name: profile.name, target: profile.target });
                setShowProfileModal(false);
                notify('Profile updated.');
              }}
            >
              Save Profile
            </button>
            <button className="studio-secondary" onClick={() => setShowProfileModal(false)}>
              Cancel
            </button>
          </div>
        </dialog>
      )}

      {/* Upload Progress Modal */}
      {(uploadProgress || uploadReport) && (
        <dialog
          className="studio-modal"
          open
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 130 }}
        >
          <div className="studio-modal-heading">
            <h2>{uploadReport ? 'Upload Report' : 'Importing Tests'}</h2>
            {uploadReport && (
              <button className="studio-quiet" onClick={() => setUploadReport(null)}>
                ✕
              </button>
            )}
          </div>

          {uploadProgress && (
            <div className="studio-drop">
              <strong>{uploadProgress}</strong>
              <p>Unpacking ZIP archives, sanitizing markup, and verifying answer keys…</p>
            </div>
          )}

          {uploadReport && (
            <div>
              <p>
                <strong>{uploadReport.imported}</strong> tests successfully imported ·{' '}
                <strong>{uploadReport.duplicates}</strong> duplicates skipped.
              </p>

              {uploadReport.errors.length > 0 && (
                <div className="studio-callout" style={{ color: '#842f1f', background: '#faf0ed' }}>
                  <strong>Issues Encountered ({uploadReport.errors.length}):</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                    {uploadReport.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {uploadReport.errors.length > 10 && (
                      <li>...and {uploadReport.errors.length - 10} more.</li>
                    )}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="studio-primary" onClick={() => setUploadReport(null)}>
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
