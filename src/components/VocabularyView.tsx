import {lookupVocabulary} from "../services/dictionary";
import {BookOpen,Plus,Download,Pencil,RotateCw,Search} from "lucide-react";
import {Modal} from "./Modal";
import {Select} from "./Select";
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { VocabularyItem, UserProfile } from '../types';

interface VocabularyViewProps {
  vocabulary: VocabularyItem[];
  profile: UserProfile;
  onSaveWord: (word: Partial<VocabularyItem>) => Promise<void>;
  onArchiveWord: (wordId: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

export const VocabularyView: React.FC<VocabularyViewProps> = ({
  vocabulary,
  profile,
  onSaveWord,
  onArchiveWord,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [definitions,setDefinitions]=useState<Record<string,string>>({});
  const jobs=useRef(new Set<string>()),tried=useRef(new Set<string>());
  const latest=useRef({owner:profile.id,vocabulary,onSaveWord});latest.current={owner:profile.id,vocabulary,onSaveWord};
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    const owner=profile.id;
    if(owner==='guest')return;
    for(const item of vocabulary){
      const key=owner+':'+item.id+':'+item.word;
      if(jobs.current.size>=3)break;
      if(item.archived||item.meaning.trim()||tried.current.has(key)||jobs.current.has(key))continue;
      tried.current.add(key);jobs.current.add(key);
      setDefinitions(previous=>({...previous,[item.id]:'Looking up meaning…'}));
      void lookupVocabulary(item.word,item.example).then(async definition=>{
        const current=latest.current.vocabulary.find(word=>word.id===item.id);
        if(!mounted.current||latest.current.owner!==owner||!current||current.archived||current.meaning.trim()||current.word!==item.word)return;
        await latest.current.onSaveWord({...current,...definition});
      }).then(()=>{if(mounted.current)setDefinitions(previous=>({...previous,[item.id]:''}));})
      .catch(error=>{if(mounted.current&&latest.current.owner===owner)setDefinitions(previous=>({...previous,[item.id]:error instanceof Error?error.message:'Could not look up this word.'}));})
      .finally(()=>{jobs.current.delete(key);if(mounted.current)setDefinitions(previous=>({...previous}));});
    }
  },[vocabulary,profile.id,definitions]);
  const [saveError,setSaveError]=useState('');
  const [editingWord, setEditingWord] = useState<Partial<VocabularyItem> | null>(null);

  const isVi = false;

  const activeWords = useMemo(() => {
    return vocabulary
      .filter((w) => !w.archived)
      .filter((w) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          w.word.toLowerCase().includes(q) ||
          w.meaning.toLowerCase().includes(q) ||
          w.example.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [vocabulary, search]);

  const handleExportCsv = () => {
    if (activeWords.length === 0) {
      onNotify('No vocabulary words to export.');
      return;
    }
    const cell = (s: unknown) => `"${String(s || '').replaceAll('"', '""')}"`;
    const header = '\ufeffword,meaning,example,part_of_speech\r\n';
    const rows = activeWords
      .map((w) => [w.word, w.meaning, w.example, w.partOfSpeech].map(cell).join(','))
      .join('\r\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IELTS_Vocabulary_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    onNotify('Anki-compatible CSV exported.');
  };

  const handleSubmitWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWord?.word?.trim()) {
      onNotify('Please enter a word or phrase.');
      return;
    }
    try {await onSaveWord(editingWord);setEditingWord(null);setSaveError('');}catch(error){setSaveError((error as Error).message);}
  };

  return (
    <div className="vocab-notebook">
      <header className="vocab-heading"><div><span className="portal-eyebrow">YOUR WORD COLLECTION</span><h1>Vocabulary</h1><p>Your saved words, with their dictionary meanings.</p></div><div className="vocab-heading-actions"><button className="studio-secondary" onClick={handleExportCsv}><Download size={16}/>Export CSV</button><button className="studio-primary" onClick={()=>{setSaveError('');setEditingWord({word:'',meaning:'',example:'',partOfSpeech:''});}}><Plus size={16}/>Add word</button></div></header>
      <div className="vocab-toolbar"><label className="vocab-search"><Search size={18}/><input aria-label="Search saved vocabulary" placeholder="Search words or meanings…" value={search} onChange={event=>setSearch(event.target.value)}/></label><span>{activeWords.length} {activeWords.length===1?'word':'words'}</span></div>
      {activeWords.length > 0 ? (
        <div className="vocab-grid">
          {activeWords.map(item=>{
            const meanings=item.meaning.split('\n').map(meaning=>meaning.trim()).filter(Boolean);
            const failed=!meanings.length&&definitions[item.id]&&definitions[item.id]!=='Looking up meaning…';
            return <article key={item.id} className="vocab-card"><div className="vocab-card-heading"><div><h2>{item.word}</h2>{item.phonetic&&<span className="vocab-phonetic">{item.phonetic}</span>}</div><button className="vocab-edit" aria-label={'Edit '+item.word} title="Edit word" onClick={()=>{setSaveError('');setEditingWord(item);}}><Pencil size={16}/></button></div>
              <div className="vocab-labels">{meanings.length&&item.partOfSpeech?<span>{item.partOfSpeech}</span>:null}{item.definitionLanguage==='en'&&<small>English definition</small>}</div>
              {meanings.length?<><ol className="vocab-meanings">{meanings.slice(0,3).map((meaning,index)=><li key={index}>{meaning}</li>)}</ol>{meanings.length>3&&<details className="vocab-more"><summary>{meanings.length-3} more meanings</summary><ol className="vocab-meanings" start={4}>{meanings.slice(3).map((meaning,index)=><li key={index}>{meaning}</li>)}</ol></details>}</>:<div className="vocab-lookup-state" role="status"><BookOpen size={17}/><p>{failed?'Could not load this definition yet.':'Finding dictionary meanings…'}</p>{failed&&<button title="Retry lookup" onClick={()=>{tried.current.delete(profile.id+':'+item.id+':'+item.word);setDefinitions(previous=>({...previous,[item.id]:''}));}}><RotateCw size={14}/>Retry lookup</button>}</div>}
              {item.dictionarySource&&<a className="vocab-source" href={item.dictionarySource==='wiktionary'?'https://en.wiktionary.org/':'https://dict.minhqnd.com/'} target="_blank" rel="noreferrer">{item.dictionarySource==='wiktionary'?'Wiktionary':'minhqnd Dictionary'}<span>↗</span></a>}
            </article>;
          })}
        </div>
      ) : (
        <div className="studio-empty">
          <p style={{ fontWeight: 600, fontSize: '14px' }}>
            {isVi ? 'Chưa có từ vựng nào được lưu.' : 'Your vocabulary notebook is empty.'}
          </p>
          <p style={{ maxWidth: '460px', margin: '6px auto 14px' }}>
            {isVi
              ? 'Khi đọc bài thi, bôi đen bất kỳ từ hoặc cụm từ nào để tra từ điển và lưu vào sổ tay ngay lập tức.'
              : 'Highlight any word or phrase while reading a test passage to trigger the dictionary lookup and save it to your notebook.'}
          </p>
          <button
            className="studio-secondary"
            onClick={() =>
              setEditingWord({
                word: '',
                meaning: '',
                example: '',
                partOfSpeech: 'noun',
              })
            }
          >
            + {isVi ? 'Thêm từ đầu tiên' : 'Add first word'}
          </button>
        </div>
      )}

      <p className="vocab-attribution">Dictionary data: <a href="https://dict.minhqnd.com/" target="_blank" rel="noreferrer">minhqnd</a> · <a href="https://en.wiktionary.org/" target="_blank" rel="noreferrer">Wiktionary</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA</a></p>
      {/* Add / Edit Word Modal */}
      {editingWord && (
        <Modal className="vocab-edit-dialog" label={editingWord.id?'Edit word':'Add word'} onClose={()=>setEditingWord(null)}>
          <div className="studio-modal-heading">
            <h2>{editingWord.id ? 'Edit Word' : 'Save Vocabulary Word'}</h2>
            <button className="studio-quiet" onClick={() => setEditingWord(null)}>
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmitWord}>{saveError&&<p role="alert">{saveError}</p>}
            <label className="studio-field">
              Word / Phrase
              <input
                required
                value={editingWord.word || ''}
                onChange={(e) => setEditingWord({ ...editingWord, word: e.target.value })}
                placeholder="e.g. ubiquitous, viable alternative"
              />
            </label>

            <label className="studio-field">
              Part of Speech
              <Select
                value={editingWord.partOfSpeech || ''}
                onChange={(e) => setEditingWord({ ...editingWord, partOfSpeech: e.target.value })}
              >
                <option value="">From dictionary</option>{editingWord.partOfSpeech&&!['noun','verb','adjective','adverb','phrase'].includes(editingWord.partOfSpeech)&&<option value={editingWord.partOfSpeech}>{editingWord.partOfSpeech}</option>}<option value="noun">Noun</option>
                <option value="verb">Verb</option>
                <option value="adjective">Adjective</option>
                <option value="adverb">Adverb</option>
                <option value="phrase">Phrase / Collocation</option>
              </Select>
            </label>

            <label className="studio-field">
              Meaning (English or Vietnamese)
              <textarea rows={4}
                value={editingWord.meaning || ''}
                onChange={(e) => setEditingWord({ ...editingWord, meaning: e.target.value })}
                placeholder="Leave blank to look up the dictionary automatically"
              />
            </label>

            <label className="studio-field">
              Example Context Sentence
              <textarea
                value={editingWord.example || ''}
                onChange={(e) => setEditingWord({ ...editingWord, example: e.target.value })}
                placeholder="Sentence from the IELTS passage..."
                rows={3}
              />
            </label>

            <div className="studio-actions" style={{ marginTop: '20px' }}>
              <button type="submit" className="studio-primary">
                Save Word
              </button>

              {editingWord.id && (
                <button
                  type="button"
                  className="studio-quiet studio-danger"
                  onClick={async () => {
                    await onArchiveWord(editingWord.id!);
                    setEditingWord(null);
                    onNotify('Word archived.');
                  }}
                >
                  Archive Word
                </button>
              )}

              <button
                type="button"
                className="studio-secondary"
                onClick={() => setEditingWord(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

