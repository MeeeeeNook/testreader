import {ListeningMediaEditor} from './ListeningMediaEditor';
import {audioMime} from '../services/listening';
import {TestCover} from "./TestCover";
import {createId} from "../services/ids";
import {RichEditor} from "./RichEditor";
import {Select} from "./Select";
import {FolderPicker} from "./FolderPicker";
import {folderLocation,type LibraryFolder} from "../services/folders";
import {auditTest} from "../services/testAudit";
import {passageTitle} from "../services/passageTitle";
import React, { useState } from 'react';
import { EditableTest, EditablePart, TestQuestion, TestSlot } from '../types';
import { firestoreAdapter } from '../services/firestoreAdapter';

interface TestEditorViewProps {
  test: EditableTest;
  folders?: LibraryFolder[];
  onSave: (test: EditableTest, status: 'published' | 'draft') => Promise<void>;
  onPreview: (test: EditableTest) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const TestEditorView: React.FC<TestEditorViewProps> = ({
  test: initialTest,
  folders=[],
  onSave,
  onPreview,
  onClose,
  onNotify,
}) => {
  const [test, setTest] = useState<EditableTest>(JSON.parse(JSON.stringify(initialTest)));
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);
  const [newQuestionType, setNewQuestionType] = useState<'text' | 'select' | 'radio' | 'multi'>('text');
  const [newQuestionLabel, setNewQuestionLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [audioBusy,setAudioBusy]=useState(false);
  const [coverBusy,setCoverBusy]=useState(false);
  const uploadCover=async(file?:File)=>{if(!file)return;if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>5*1024*1024){onNotify('Choose a PNG, JPEG, WebP or GIF image up to 5 MB.');return;}setCoverBusy(true);try{const image=await createImageBitmap(file),scale=Math.min(1,1200/image.width,800/image.height),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);image.close();const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not process this image.')),'image/webp',.82));const url=await firestoreAdapter.uploadMedia(blob,`tests/${test.id}/covers/${Date.now()}.webp`);setTest(prev=>({...prev,coverImage:url}));}catch(error){onNotify((error as Error).message);}finally{setCoverBusy(false);}};
  const [openQuestions,setOpenQuestions]=useState<number[]>([]);
  const uploadEditorImage=(file:File)=>firestoreAdapter.uploadMedia(file,`tests/${test.id}/images/${Date.now()}-${file.name}`);

  const part = test.parts[currentPartIndex] || test.parts[0];
  const issues = auditTest(test);

  const updatePart = (updater: (p: EditablePart) => void) => {
    setTest((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as EditableTest;
      if (next.parts[currentPartIndex]) {
        updater(next.parts[currentPartIndex]);
      }
      return next;
    });
  };

  const handleAddSection = () => {
    const newIdx = test.parts.length + 1;
    const newPart: EditablePart = {
      id: `p_${createId()}`,
      title: `Passage ${newIdx}`,
      passageHtml: `<h2>Passage ${newIdx}</h2><p>Write your reading passage or transcript text here.</p>`,
      questionHtml: `<h3>Questions</h3><p>Write instructions, then add question fields below.</p>`,
      slots: {},
      questions: [],
      audio: '',
    };
    setTest((prev) => ({
      ...prev,
      parts: [...prev.parts, newPart],
    }));
    setCurrentPartIndex(test.parts.length);
    onNotify('New section added.');
  };

  const handleRemoveSection = () => {
    if (test.parts.length <= 1) {
      onNotify('A test must contain at least one section.');
      return;
    }
    if (!confirm('Are you sure you want to remove this section?')) return;
    setTest((prev) => ({
      ...prev,
      parts: prev.parts.filter((_, i) => i !== currentPartIndex),
    }));
    setCurrentPartIndex(Math.max(0, currentPartIndex - 1));
    onNotify('Section removed.');
  };

  const handleAddQuestionConfirm = () => {
    const allNums = test.parts.flatMap((p) => p.questions.map((q) => q.number));
    const nextNum = (allNums.length > 0 ? Math.max(...allNums) : 0) + 1;
    const slotId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const numbers = newQuestionType === 'multi' ? [nextNum, nextNum + 1] : [nextNum];

    const defaultOptions =
      newQuestionType === 'text'
        ? []
        : [
            { value: 'A', label: 'First option' },
            { value: 'B', label: 'Second option' },
            { value: 'C', label: 'Third option' },
            { value: 'D', label: 'Fourth option' },
          ];

    const newSlot: TestSlot = {
      id: slotId,
      numbers,
      type: newQuestionType,
      label: newQuestionLabel.trim(),
      options: defaultOptions,
    };

    const newQuestions: TestQuestion[] = numbers.map((n) => ({
      number: n,
      kind:
        newQuestionType === 'text'
          ? 'fill_blank'
          : newQuestionType === 'select'
          ? 'matching_features'
          : newQuestionType === 'multi'
          ? 'multiple_choice_many'
          : 'multiple_choice_one',
      answer: '',
      explanationHtml: '',
      referenceQuote: '',
      missing: false,
    }));

    updatePart((p) => {
      p.slots[slotId] = newSlot;
      p.questions.push(...newQuestions);
      p.questionHtml += `<p><span data-slot="${slotId}"></span></p>`;
    });

    setShowAddQuestionModal(false);
    setNewQuestionLabel('');
    onNotify(`Question ${numbers.join('–')} added.`);
  };

  const handleRemoveQuestion = (qNumber: number) => {
    if (!confirm(`Remove question ${qNumber} and its layout field?`)) return;

    updatePart((p) => {
      // Find slot
      const slotEntry = Object.entries(p.slots).find(([_, slot]) => slot.numbers.includes(qNumber));
      if (slotEntry) {
        const [slotId, slot] = slotEntry;
        delete p.slots[slotId];
        p.questions = p.questions.filter((q) => !slot.numbers.includes(q.number));
        // Remove data-slot tag from layout
        p.questionHtml = p.questionHtml.replace(
          new RegExp(`<span[^>]*data-slot=["']${slotId}["'][^>]*>.*?</span>`, 'gi'),
          ''
        );
      } else {
        p.questions = p.questions.filter((q) => q.number !== qNumber);
      }
    });
    onNotify(`Question ${qNumber} removed.`);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      onNotify('Uploading image to Firebase Storage…');
      const url = await firestoreAdapter.uploadMedia(file, `tests/${test.id}/images/${file.name}`);
      updatePart((p) => {
        p.passageHtml += `<p><img src="${url}" alt="${file.name}" style="max-width:100%;height:auto;display:block;margin:18px auto;" /></p>`;
      });
      onNotify('Image inserted into passage.');
    } catch (err) {
      onNotify('Failed to upload image: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      onNotify('Uploading listening audio to Firebase Storage…');
      const url = await firestoreAdapter.uploadMedia(file, `tests/${test.id}/audio/${file.name}`);
      updatePart((p) => {
        p.audio = url;
      });
      onNotify('Audio attached to section.');
    } catch (err) {
      onNotify('Failed to upload audio: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCommit = async (status: 'published' | 'draft') => {
    if (!test.title.trim()) {
      onNotify('Please enter a test title.');
      return;
    }
    setSaving(true);
    try {
      if(status==='published'&&test.skill==='listening'&&test.parts.some(p=>!p.audio||(p.audioEnd&&p.audioEnd<=(p.audioStart||0))))throw new Error('Assign a valid recording and time range to every Listening part before publishing.');
      const copy = { ...test, status };
      delete copy.contentHash;
      await onSave(copy, status);
      onNotify(status === 'published' ? 'Test published to library.' : 'Draft saved.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ paddingBottom: '60px' }}>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">CREATE & REFINE</div>
          <h1 className="studio-heading">Test Editor</h1>
          <p className="studio-lead">
            Edit passages, questions, answers and explanations.
          </p>
        </div>

        <div className="studio-actions">
          <button className="studio-secondary" onClick={() => onPreview(test)}>
            Preview Test
          </button>
          <button
            className="studio-secondary"
            onClick={() => handleCommit('draft')}
            disabled={saving||coverBusy||audioBusy}
          >
            Save Draft
          </button>
          <button
            className="studio-primary"
            onClick={() => handleCommit('published')}
            disabled={saving||coverBusy||audioBusy}
          >
            Publish to Library
          </button>
          <button className="studio-quiet" onClick={onClose}>
            Back
          </button>
        </div>
      </div>

      <details className="studio-panel test-audit" open={issues.length > 0}>
        <summary>Content check · {issues.length ? `${issues.length} items to review` : "Ready"}</summary>
        {issues.length ? <ul>{issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul> : <p>Titles, answer keys and controls are present.</p>}
      </details>
      {/* Meta Properties Panel */}
      <div className="studio-panel">
        <div className="studio-form-grid">
          <label className="studio-field">
            Test Title
            <input
              value={test.title}
              onChange={(e) => setTest({ ...test, title: e.target.value })}
              placeholder="e.g. Cambridge 18 — Academic Reading Test 1"
            />
          </label>

          <FolderPicker folders={folders} value={test.folderId||""} onChange={id=>setTest({...test,folderId:id||null,folderPath:folderLocation(id,folders)})}/>


          <label className="studio-field">
            Skill
            <Select
              value={test.skill}
              onChange={(e) => setTest({ ...test, skill: e.target.value as 'reading'|'listening', duration:e.target.value==='listening'?30:60 })}
            >
              <option value="reading">Academic Reading</option>
              <option value="listening">Listening</option>
            </Select>
          </label>

          <label className="studio-field">
            Default Duration (Minutes)
            <input
              type="number"
              value={test.duration}
              onChange={(e) => setTest({ ...test, duration: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      <section className="studio-panel cover-editor"><div><h2>Test cover</h2><p>Upload an image for this test. Images are resized and compressed before uploading.</p><label className="studio-secondary">{coverBusy?'Uploading…':'Choose image'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={coverBusy||saving} onChange={e=>{void uploadCover(e.target.files?.[0]);e.target.value='';}}/></label>{test.coverImage&&<button className="quiet-button" disabled={coverBusy} onClick={()=>setTest({...test,coverImage:''})}>Use illustration</button>}</div><TestCover id={test.id} title={test.title} image={test.coverImage}/></section>
      {/* Section Tabs */}
      <div className="editor-tabs">
        {test.parts.map((p, idx) => (
          <button
            key={p.id || idx}
            className={`studio-chip ${idx === currentPartIndex ? 'active' : ''}`}
            onClick={() => setCurrentPartIndex(idx)}
          >
            {idx + 1}. {p.title || `Passage ${idx + 1}`}
          </button>
        ))}
        <button className="studio-secondary" onClick={handleAddSection}>
          + Add Section
        </button>
      </div>

      {/* Section Content Panel */}
      <div className="studio-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <label className="studio-field" style={{ margin: 0, flex: 1, maxWidth: '400px' }}>
            Passage / Section Title
            <input
              value={part.title}
              onChange={(e) => {const title=e.target.value;updatePart(p=>{const root=document.createElement('div');root.innerHTML=p.passageHtml;const heading=Array.from(root.querySelectorAll('h1,h2,h3,h4')).find(h=>h.textContent?.trim()===p.title.trim());if(heading){heading.textContent=title;p.passageHtml=root.innerHTML;}p.title=title;});}}
            />
          </label>

          <label className="studio-field" style={{margin:"0 15px"}}>Passage / Section number
            <Select value={part.position || currentPartIndex + 1} onChange={e=>updatePart(p=>{p.position=Number(e.target.value);})}>{Array.from({length:test.skill==='reading'?3:4},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</Select>
          </label>
          <button className="studio-secondary" onClick={()=>updatePart(p=>{p.title=passageTitle(p.passageHtml,'',currentPartIndex);})}>Detect title</button>
          <button
            className="studio-quiet studio-danger"
            onClick={handleRemoveSection}
            disabled={test.parts.length <= 1}
          >
            Remove This Section
          </button>
        </div>

        {test.skill==='listening'&&<ListeningMediaEditor test={test} onChange={setTest} onBusyChange={setAudioBusy} onUpload={async (file,onProgress)=>{const blob=new Blob([file],{type:audioMime(file.name)});const id=createId();const url=await firestoreAdapter.uploadMedia(blob,`tests/${test.id}/audio/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`,(sent,total)=>onProgress?.(100*sent/Math.max(1,total)));return {id,name:file.name,url,size:file.size};}}/>}

        {/* Passage / Transcript Editor */}
        <div style={{ marginTop: '20px' }}>
          <div className="studio-heading-line" style={{ marginBottom: '8px' }}>
            <h4 style={{ margin: 0 }}>Passage / Transcript Content</h4>
            <div className="editor-toolbar">
              <label className="studio-quiet" style={{ cursor: 'pointer' }}>
                + Add Diagram / Image
                <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
              </label>
            </div>
          </div>

          <RichEditor documentId={part.id+':passage'} label={test.skill==='listening'?'Transcript (solution screen only)':'Reading passage'} value={part.passageHtml} slots={part.slots} onUploadImage={uploadEditorImage} onChange={html=>updatePart(p=>{p.passageHtml=html;})}/>
        </div>

        {/* Question Layout Editor */}
        <div style={{ marginTop: '24px' }}>
          <div className="studio-heading-line" style={{ marginBottom: '8px' }}>
            <h4 style={{ margin: 0 }}>Question Instructions & Layout</h4>
            <span className="studio-small">
              Answer fields appear as question chips.
            </span>
          </div>

          <RichEditor documentId={part.id+':questions'} label="Questions" value={part.questionHtml} slots={part.slots} onUploadImage={uploadEditorImage} onChange={html=>updatePart(p=>{p.questionHtml=html;})}/>
        </div>
      </div>

      {/* Question Items & Answers Accordion */}
      <div className="studio-panel">
        <div className="studio-heading-line" style={{ marginBottom: '18px' }}>
          <h3 style={{ margin: 0 }}>Answer Keys & Explanations ({part.questions.length} Questions)</h3>
          <button className="studio-primary" onClick={() => setShowAddQuestionModal(true)}>
            + Add Question Field
          </button>
        </div>

        {part.questions.length === 0 ? (
          <div className="studio-empty">
            No questions added to this section yet. Click "+ Add Question Field" above.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {part.questions.map((q) => {
              const slot = Object.values(part.slots).find((s) => s.numbers.includes(q.number));
              return (
                <details key={q.number} className="editor-question" onToggle={e=>{const open=e.currentTarget.open;setOpenQuestions(items=>open?[...new Set([...items,q.number])]:items.filter(n=>n!==q.number));}}>
                  <summary>
                    <strong>Question {q.number}</strong>
                    <span style={{ marginLeft: '12px', color: 'var(--teal)', fontSize: '12px' }}>
                      Key: {q.answer || '(Not set)'}
                    </span>
                    {q.missing && (
                      <span className="studio-tag studio-danger" style={{ marginLeft: '8px' }}>
                        Ungraded (Missing Source)
                      </span>
                    )}
                  </summary>

                  <div style={{ paddingTop: '12px' }}>
                    {slot && (
                      <div className="studio-form-grid" style={{ marginBottom: '12px' }}>
                        <label className="studio-field">
                          Input Type
                          <Select
                            value={slot.type}
                            onChange={(e) => {
                              const newType = e.target.value as any;
                              updatePart((p) => {
                                const targetSlot = p.slots[slot.id];
                                if (targetSlot) {
                                  targetSlot.type = newType;
                                }
                              });
                            }}
                          >
                            <option value="text">Fill in the blank / Short text</option>
                            <option value="select">Dropdown Matching</option>
                            <option value="radio">Multiple Choice (Single answer)</option>
                            <option value="multi">Multiple Choice (Choose multiple)</option>
                          </Select>
                        </label>

                        {slot.type !== 'text' && (
                          <label className="studio-field">
                            Options (format: value | label, one per line)
                            <textarea
                              rows={3}
                              value={slot.options.map((o) => `${o.value} | ${o.label}`).join('\n')}
                              onChange={(e) => {
                                const lines = e.target.value.split('\n').filter((l) => l.trim());
                                const parsed = lines.map((l, idx) => {
                                  const bits = l.split('|');
                                  return {
                                    value: bits.length > 1 ? bits[0].trim() : String.fromCharCode(65 + idx),
                                    label: bits.length > 1 ? bits[1].trim() : bits[0].trim(),
                                  };
                                });
                                updatePart((p) => {
                                  const targetSlot = p.slots[slot.id];
                                  if (targetSlot) targetSlot.options = parsed;
                                });
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )}

                    <label className="studio-field">
                      Accepted Answer(s) — separate alternative variants with ||
                      <input
                        value={q.answer}
                        onChange={(e) => {
                          const val = e.target.value;
                          updatePart((p) => {
                            const targetQ = p.questions.find((x) => x.number === q.number);
                            if (targetQ) targetQ.answer = val;
                          });
                        }}
                        placeholder="e.g. TRUE or False or 15% || 15 percent"
                      />
                    </label>

                    <label className="studio-field">
                      Reference Quote from Passage (for "Locate quote in passage" button)
                      <input
                        value={q.referenceQuote || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          updatePart((p) => {
                            const targetQ = p.questions.find((x) => x.number === q.number);
                            if (targetQ) targetQ.referenceQuote = val;
                          });
                        }}
                        placeholder="Exact snippet from passage where the answer is found"
                      />
                    </label>

                    <label className="studio-field">
                      Explanation (optional, displayed in review and practice mode)
                      {openQuestions.includes(q.number)&&<RichEditor documentId={part.id+':explanation:'+q.number} label={'Explanation '+q.number} value={q.explanationHtml||''} onUploadImage={uploadEditorImage} onChange={html=>updatePart(p=>{const question=p.questions.find(item=>item.number===q.number);if(question)question.explanationHtml=html;})}/>} 
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <input
                          type="checkbox"
                          checked={q.missing || false}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            updatePart((p) => {
                              const targetQ = p.questions.find((x) => x.number === q.number);
                              if (targetQ) targetQ.missing = checked;
                            });
                          }}
                        />
                        Source question is missing — mark ungraded (do not penalize student)
                      </label>

                      <button
                        className="studio-quiet studio-danger"
                        onClick={() => handleRemoveQuestion(q.number)}
                      >
                        Remove Question {q.number}
                      </button>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Question Modal Dialog */}
      {showAddQuestionModal && (
        <dialog
          className="studio-modal"
          open
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 120 }}
        >
          <div className="studio-modal-heading">
            <h2>Add Question Field</h2>
            <button className="studio-quiet" onClick={() => setShowAddQuestionModal(false)}>
              ✕
            </button>
          </div>

          <label className="studio-field">
            Question Type
            <Select
              value={newQuestionType}
              onChange={(e) => setNewQuestionType(e.target.value as any)}
            >
              <option value="text">Fill in the blank / Short text</option>
              <option value="select">Matching / Headings dropdown</option>
              <option value="radio">Multiple Choice (Single answer)</option>
              <option value="multi">Multiple Choice (Choose Two)</option>
            </Select>
          </label>

          <label className="studio-field">
            Question Stem / Label (optional)
            <input
              value={newQuestionLabel}
              onChange={(e) => setNewQuestionLabel(e.target.value)}
              placeholder="e.g. Which paragraph contains the following information?"
            />
          </label>

          <p className="studio-small">
            The new question placeholder chip will be appended to the question layout. You can move or
            style it anywhere inside the question wording.
          </p>

          <div className="studio-actions" style={{ marginTop: '20px' }}>
            <button className="studio-primary" onClick={handleAddQuestionConfirm}>
              Add Question
            </button>
            <button className="studio-secondary" onClick={() => setShowAddQuestionModal(false)}>
              Cancel
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
};


