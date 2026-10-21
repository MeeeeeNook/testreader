import React, { useState, useMemo } from 'react';
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
  const [editingWord, setEditingWord] = useState<Partial<VocabularyItem> | null>(null);

  const isVi = profile.language === 'vi';

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
    await onSaveWord(editingWord);
    setEditingWord(null);
    onNotify('Word saved to notebook.');
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">
            {isVi ? 'TỪ VỰNG QUAN TRỌNG' : 'WORDS WORTH KEEPING'}
          </div>
          <h1 className="studio-heading">
            {isVi ? 'Sổ từ vựng của bạn.' : 'Your vocabulary notebook.'}
          </h1>
          <p className="studio-lead">
            {isVi
              ? 'Lưu lại từ vựng trực tiếp khi đọc bài thi, tra từ điển AI, ghi chú nghĩa và xuất thẻ ghi nhớ cho Anki.'
              : 'Save collocations and academic vocabulary directly from reading passages, record contextual meanings, and export flashcards for Anki.'}
          </p>
        </div>

        <div className="studio-actions">
          <button
            className="studio-primary"
            onClick={() =>
              setEditingWord({
                word: '',
                meaning: '',
                example: '',
                partOfSpeech: 'noun',
              })
            }
          >
            + {isVi ? 'Thêm từ mới' : 'Add word'}
          </button>
          <button className="studio-secondary" onClick={handleExportCsv}>
            {isVi ? 'Xuất CSV (Anki)' : 'Export CSV (Anki)'}
          </button>
        </div>
      </div>

      <div className="studio-toolbar">
        <div className="studio-search">
          <input
            placeholder={isVi ? 'Tìm kiếm từ hoặc định nghĩa…' : 'Search words, definitions or contexts…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {activeWords.length > 0 ? (
        <div className="studio-grid">
          {activeWords.map((item) => (
            <article key={item.id} className="test-card" style={{ minHeight: '190px' }}>
              <div className="card-top">
                <span className="studio-tag" style={{ textTransform: 'uppercase' }}>
                  {item.partOfSpeech || 'term'}
                </span>
                <button
                  className="studio-quiet"
                  style={{ padding: '3px 8px', fontSize: '10px' }}
                  onClick={() => setEditingWord(item)}
                >
                  Edit
                </button>
              </div>

              <h3 style={{ margin: '14px 0 8px', fontSize: '20px' }}>{item.word}</h3>

              <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--studio-ink)', lineHeight: '1.6' }}>
                {item.meaning}
              </p>

              {item.example && (
                <p
                  style={{
                    margin: 'auto 0 0',
                    font: 'italic 12px/1.6 var(--studio-serif)',
                    color: 'var(--studio-muted)',
                    borderLeft: '2px solid var(--studio-border)',
                    paddingLeft: '8px',
                  }}
                >
                  "{item.example}"
                </p>
              )}
            </article>
          ))}
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

      {/* Add / Edit Word Modal */}
      {editingWord && (
        <dialog
          className="studio-modal"
          open
          style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 120 }}
        >
          <div className="studio-modal-heading">
            <h2>{editingWord.id ? 'Edit Word' : 'Save Vocabulary Word'}</h2>
            <button className="studio-quiet" onClick={() => setEditingWord(null)}>
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmitWord}>
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
              <select
                value={editingWord.partOfSpeech || 'noun'}
                onChange={(e) => setEditingWord({ ...editingWord, partOfSpeech: e.target.value })}
              >
                <option value="noun">Noun</option>
                <option value="verb">Verb</option>
                <option value="adjective">Adjective</option>
                <option value="adverb">Adverb</option>
                <option value="phrase">Phrase / Collocation</option>
              </select>
            </label>

            <label className="studio-field">
              Meaning (English or Vietnamese)
              <input
                value={editingWord.meaning || ''}
                onChange={(e) => setEditingWord({ ...editingWord, meaning: e.target.value })}
                placeholder="Definition or translation"
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
        </dialog>
      )}
    </div>
  );
};
