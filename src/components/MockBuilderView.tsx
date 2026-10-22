import {Select} from "./Select";
import React, { useState, useEffect } from 'react';
import { TestMeta, EditableTest, EditablePart } from '../types';
import { firestoreAdapter } from '../services/firestoreAdapter';

interface MockBuilderViewProps {
  tests: TestMeta[];
  onStartSession: (test: EditableTest, mode: 'practice' | 'exam', durationMinutes: number) => void;
  onNotify: (msg: string) => void;
}

export const MockBuilderView: React.FC<MockBuilderViewProps> = ({
  tests,
  onStartSession,
  onNotify,
}) => {
  const [skill, setSkill] = useState<'reading' | 'listening'>('reading');
  const [mode, setMode] = useState<'practice' | 'exam'>('exam');

  const published = tests.filter((t) => t.status === 'published' && t.skill === skill);
  const count = skill === 'listening' ? 4 : 3;

  // Selected tests and part indices for each section
  const [selections, setSelections] = useState<{ testId: string; partIndex: number }[]>([
    { testId: published[0]?.id || '', partIndex: 0 },
    { testId: published[1]?.id || published[0]?.id || '', partIndex: 1 },
    { testId: published[2]?.id || published[0]?.id || '', partIndex: 2 },
    { testId: published[3]?.id || published[0]?.id || '', partIndex: 3 },
  ]);

  const publishedKey = published.map(t => t.id).join('|');
  useEffect(() => {
    setSelections(prev => Array.from({ length: count }, (_, i) => {
      const selected = prev[i];
      return published.some(t => t.id === selected?.testId) ? selected : { testId: published[i % (published.length || 1)]?.id || '', partIndex: 0 };
    }));
  }, [publishedKey, count]);

  const [passageNames, setPassageNames] = useState<Record<string, string[]>>({});
  const selectedIds = [...new Set(selections.map(s => s.testId).filter(Boolean))].sort().join('|');
  useEffect(() => {
    let cancelled = false;
    const ids = selectedIds.split('|').filter(Boolean);
    void Promise.all(ids.map(async id => {
      try {
        const full = await firestoreAdapter.getTestComplete(id);
        if (!cancelled) setPassageNames(previous => ({...previous, [id]: full.parts.map(p => p.title)}));
      } catch { /* Compilation reports unavailable tests when the learner starts. */ }
    }));
    return () => { cancelled = true; };
  }, [selectedIds]);

  const handleTestChange = (sectionIdx: number, testId: string) => {
    setSelections((prev) => {
      const next = [...prev];
      next[sectionIdx] = { testId, partIndex: 0 };
      return next;
    });
  };

  const handlePartChange = (sectionIdx: number, partIndex: number) => {
    setSelections((prev) => {
      const next = [...prev];
      next[sectionIdx] = { ...next[sectionIdx], partIndex };
      return next;
    });
  };

  const handleRandomize = () => {
    if (!published.length) {
      onNotify('Upload tests in Admin Studio first.');
      return;
    }
    const next = Array.from({ length: count }, () => {
      const randomTest = published[Math.floor(Math.random() * published.length)];
      const maxPart = Math.max(0, (randomTest.passages || 1) - 1);
      const randomPart = Math.floor(Math.random() * (maxPart + 1));
      return { testId: randomTest.id, partIndex: randomPart };
    });
    setSelections(next);
    onNotify('Sections randomized.');
  };

  const handleStartMock = async () => {
    if (!published.length) {
      onNotify('No published tests available to build a mock.');
      return;
    }

    try {
      onNotify('Compiling full mock test…');
      const compiledParts: EditablePart[] = [];
      const sourceSections: { testId: string; sectionId: string }[] = [];
      const usedKeys = new Set<string>();

      for (let i = 0; i < count; i++) {
        const sel = selections[i];
        if (!sel?.testId) {
          throw new Error(`Please select a test for Section ${i + 1}.`);
        }
        const key = `${sel.testId}:${sel.partIndex}`;
        if (usedKeys.has(key)) {
          throw new Error('Please choose distinct sections for each part of the mock test.');
        }
        usedKeys.add(key);

        const fullTest = await firestoreAdapter.getTestComplete(sel.testId);
        const partToCopy = fullTest.parts[sel.partIndex];
        if (!partToCopy) {
          throw new Error(`Section ${sel.partIndex + 1} not found in test ${fullTest.title}.`);
        }
        sourceSections.push({ testId: sel.testId, sectionId: partToCopy.id });
        compiledParts.push({ ...JSON.parse(JSON.stringify(partToCopy)), id: `p${i}` });
      }

      // Renumber questions sequentially 1..40 across all selected parts
      let currentNumber = 1;
      for (const p of compiledParts) {
        const mapping = new Map<number, number>();
        p.questions.forEach((q) => {
          mapping.set(q.number, currentNumber++);
        });

        p.questions.forEach((q) => {
          q.number = mapping.get(q.number) || q.number;
        });

        Object.values(p.slots).forEach((slot) => {
          slot.numbers = slot.numbers.map((n) => mapping.get(n) || n);
        });

        // Update instruction numbers inside question layout text
        for (const k of ['passageHtml', 'questionHtml'] as const) {
          p[k] = p[k].replace(
            /(Questions?\s+)(\d+)(\s*[-–—]\s*)(\d+)/gi,
            (match, word, a, dash, b) => {
              const numA = Number(a);
              const numB = Number(b);
              if (mapping.has(numA) && mapping.has(numB)) {
                return `${word}${mapping.get(numA)}${dash}${mapping.get(numB)}`;
              }
              return match;
            }
          );
        }
      }

      const mockTest: EditableTest = {
        schemaVersion: 1,
        id: `mock_${Date.now()}`,
        title: `IELTS ${skill === 'reading' ? 'Academic Reading' : 'Listening'} Full Mock Test`,
        skill,
        source: 'Custom Mock',
        access: 'free',
        status: 'published',
        duration: skill === 'reading' ? 60 : 30,
        parts: compiledParts,
        sourceSections,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      onStartSession(mockTest, mode, mockTest.duration);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ maxWidth: '850px', paddingBottom: '40px' }}>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">MAKE IT YOUR OWN</div>
          <h1 className="studio-heading">Build a full mock test.</h1>
          <p className="studio-lead">
            Combine individual passages from your library, or let the studio generate a balanced exam.
            Questions and slot layouts are automatically renumbered from 1 to 40.
          </p>
        </div>
      </div>

      <div className="studio-panel">
        <div className="studio-form-grid">
          <label className="studio-field">
            Test Skill
            <Select
              value={skill}
              onChange={(e) => setSkill(e.target.value as any)}
            >
              <option value="reading">Reading — 3 passages (60 min)</option>
              <option value="listening">Listening — 4 sections (30 min)</option>
            </Select>
          </label>

          <label className="studio-field">
            Exam Mode
            <Select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="exam">Official Exam Simulation (Strict timing, hidden keys)</option>
              <option value="practice">Practice Mode (Answers & explanations toggleable)</option>
            </Select>
          </label>
        </div>

        <div style={{ margin: '24px 0 16px', borderTop: '1px solid var(--studio-border)', paddingTop: '20px' }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '15px' }}>Section Breakdown</h4>

          {published.length === 0 ? (
            <div className="studio-empty">
              No published {skill} tests found in your library. Upload some in Admin Studio first.
            </div>
          ) : (
            Array.from({ length: count }).map((_, idx) => {
              const currentSel = selections[idx] || { testId: published[0]?.id || '', partIndex: 0 };
              const currentTest = published.find((t) => t.id === currentSel.testId) || published[0];
              const passageCount = currentTest?.passages || 1;

              return (
                <div
                  key={idx}
                  className="studio-form-grid"
                  style={{
                    marginBottom: '16px',
                    padding: '14px',
                    background: '#fafbf8',
                    border: '1px solid var(--studio-border)',
                    borderRadius: '8px',
                  }}
                >
                  <label className="studio-field" style={{ margin: 0 }}>
                    Section {idx + 1} — Select Test
                    <Select
                      value={currentSel.testId}
                      onChange={(e) => handleTestChange(idx, e.target.value)}
                    >
                      {published.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.source || 'General'})
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="studio-field" style={{ margin: 0 }}>
                    Section {idx + 1} — Choose Passage
                    <Select
                      value={currentSel.partIndex}
                      onChange={(e) => handlePartChange(idx, Number(e.target.value))}
                    >
                      {Array.from({ length: passageCount }).map((_, pIdx) => (
                        <option key={pIdx} value={pIdx}>
                          {pIdx + 1}. {passageNames[currentSel.testId]?.[pIdx] || currentTest?.passageTitles?.[pIdx] || `Passage ${pIdx + 1}`}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
              );
            })
          )}
        </div>

        <div className="studio-actions" style={{ marginTop: '24px' }}>
          <button className="studio-secondary" onClick={handleRandomize}>
            ↻ Randomise sections
          </button>
          <button
            className="studio-primary"
            onClick={handleStartMock}
            disabled={published.length === 0}
          >
            Start full mock →
          </button>
        </div>

        <p className="studio-small" style={{ marginTop: '16px' }}>
          Section lengths vary across collections. The real question total is preserved, and approximate
          IELTS band estimates are shown when exactly 40 gradable questions are completed.
        </p>
      </div>
    </div>
  );
};



