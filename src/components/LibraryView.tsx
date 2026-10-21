import React, { useState, useMemo } from 'react';
import { TestMeta, UserProfile, AttemptRecord } from '../types';

interface LibraryViewProps {
  tests: TestMeta[];
  attempts: AttemptRecord[];
  profile: UserProfile;
  onSelectTest: (testId: string) => void;
  onToggleFavorite: (testId: string) => void;
  onNavigateToMock: () => void;
  onNavigateToAdmin: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  tests,
  attempts,
  profile,
  onSelectTest,
  onToggleFavorite,
  onNavigateToMock,
  onNavigateToAdmin,
}) => {
  const [skill, setSkill] = useState<'reading' | 'listening'>('reading');
  const [scope, setScope] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [sort, setSort] = useState<'title' | 'new' | 'popular'>('title');
  const [page, setPage] = useState(0);

  const isVi = profile.language === 'vi';

  // Distinct sources for current skill
  const availableSources = useMemo(() => {
    const list = tests.filter((t) => t.skill === skill && t.status === 'published');
    return Array.from(new Set(list.map((t) => t.source || 'Other collection'))).sort();
  }, [tests, skill]);

  // Attempt frequency counts for popularity sorting
  const attemptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of attempts) {
      counts.set(a.testId, (counts.get(a.testId) || 0) + 1);
    }
    return counts;
  }, [attempts]);

  // Filtered and sorted test list
  const filteredTests = useMemo(() => {
    return tests
      .filter((t) => {
        if (t.status !== 'published') return false;
        if (t.skill !== skill) return false;
        if (source && (t.source || 'Other collection') !== source) return false;
        if (search) {
          const q = search.toLowerCase();
          const matchesTitle = t.title.toLowerCase().includes(q);
          const matchesSource = (t.source || '').toLowerCase().includes(q);
          if (!matchesTitle && !matchesSource) return false;
        }
        if (scope === 'full' && t.passages <= 1) return false;
        if (scope === 'single' && t.passages > 1) return false;
        if (scope === 'favorites' && !profile.favorites.includes(t.id)) return false;
        if (['free', 'premium'].includes(scope) && t.access !== scope) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === 'new') return (b.updatedAt || 0) - (a.updatedAt || 0);
        if (sort === 'popular') return (attemptCounts.get(b.id) || 0) - (attemptCounts.get(a.id) || 0);
        return a.title.localeCompare(b.title, undefined, { numeric: true });
      });
  }, [tests, skill, source, search, scope, sort, profile.favorites, attemptCounts]);

  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filteredTests.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedTests = filteredTests.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const publishedCount = tests.filter((t) => t.status === 'published' && t.skill === skill).length;

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="studio-page-head">
        <div>
          <div className="studio-eyebrow">
            {isVi ? 'LUYỆN TẬP MỖI NGÀY' : 'A LITTLE PRACTICE, EVERY DAY'}
          </div>
          <h1 className="studio-heading">
            {isVi ? 'Sẵn sàng cho bài đọc tiếp theo.' : 'Make room for your next chapter.'}
          </h1>
          <p className="studio-lead">
            {isVi
              ? 'Đề thi chuẩn format IELTS. Không gian yên tĩnh, tập trung. Chọn đề thi trọn vẹn hoặc luyện từng phần theo thời gian của bạn.'
              : 'Real IELTS test formats. A quieter place to think. Choose a full test or work through one passage at a time.'}
          </p>
        </div>

        <div className="studio-actions">
          <button className="studio-primary" onClick={onNavigateToMock}>
            {isVi ? 'Tạo đề thi thử ↗' : 'Build a mock test ↗'}
          </button>
        </div>
      </div>

      <div className="studio-stats">
        <div className="studio-stat">
          <strong>{publishedCount}</strong>
          <span>{isVi ? 'đề thi trong thư viện' : 'tests in your library'}</span>
        </div>
        <div className="studio-stat">
          <strong>{attempts.length}</strong>
          <span>{isVi ? 'buổi luyện tập hoàn thành' : 'practice sessions completed'}</span>
        </div>
        <div className="studio-stat">
          <strong>{profile.target.toFixed(1)}</strong>
          <span>{isVi ? 'band điểm mục tiêu' : 'your target band'}</span>
        </div>
      </div>

      {/* Skill Tabs */}
      <div className="studio-chips">
        <button
          className={`studio-chip ${skill === 'reading' ? 'active' : ''}`}
          onClick={() => {
            setSkill('reading');
            setPage(0);
          }}
        >
          {isVi ? 'Kỹ năng Đọc (Reading)' : 'Reading'}
        </button>
        <button
          className={`studio-chip ${skill === 'listening' ? 'active' : ''}`}
          onClick={() => {
            setSkill('listening');
            setPage(0);
          }}
        >
          {isVi ? 'Kỹ năng Nghe (Listening)' : 'Listening'}
        </button>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="studio-toolbar">
        <div className="studio-search">
          <input
            placeholder={isVi ? 'Tìm tiêu đề hoặc bộ đề…' : 'Find a title or collection…'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <select
          className="studio-select"
          aria-label="Collection source"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{isVi ? 'Tất cả bộ đề' : 'All collections'}</option>
          {availableSources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          className="studio-select"
          aria-label="Sort tests"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as any);
            setPage(0);
          }}
        >
          <option value="title">{isVi ? 'Tiêu đề A–Z' : 'Title A–Z'}</option>
          <option value="new">{isVi ? 'Mới cập nhật' : 'Recently updated'}</option>
          <option value="popular">{isVi ? 'Được luyện nhiều nhất' : 'Most practised'}</option>
        </select>
      </div>

      {/* Scope Chips */}
      <div className="studio-chips">
        {[
          { id: 'all', label: isVi ? 'Tất cả đề' : 'All tests' },
          { id: 'full', label: isVi ? 'Đề đầy đủ' : 'Full tests' },
          { id: 'single', label: isVi ? 'Từng bài' : 'Single passage' },
          { id: 'favorites', label: isVi ? 'Đã lưu' : 'Saved' },
          { id: 'free', label: 'Free' },
          { id: 'premium', label: 'Premium' },
        ].map((item) => (
          <button
            key={item.id}
            className={`studio-chip ${scope === item.id ? 'active' : ''}`}
            onClick={() => {
              setScope(item.id);
              setPage(0);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Grid or Empty Notice */}
      <div className="studio-section-label">
        <span>
          {filteredTests.length} {isVi ? 'đề thi có sẵn' : 'tests to explore'}
        </span>
        <span>{isVi ? 'Chọn đề để bắt đầu làm bài' : 'Pick up where you left off'}</span>
      </div>

      {pagedTests.length > 0 ? (
        <>
          <div className="studio-grid">
            {pagedTests.map((t) => {
              const isFav = profile.favorites.includes(t.id);
              return (
                <article key={t.id} className="test-card">
                  <div className="card-top">
                    <span className="card-source">{t.source || 'Standard Collection'}</span>
                    <span className="studio-tag">{t.access === 'premium' ? 'PREMIUM' : 'FREE'}</span>
                  </div>

                  <div className="card-symbol">{t.skill === 'reading' ? '▤' : '♫'}</div>

                  <h3>{t.title}</h3>

                  <div className="card-meta">
                    {t.passages} {t.skill === 'reading' ? (t.passages === 1 ? 'passage' : 'passages') : 'sections'} ·{' '}
                    {t.questions} questions · {t.duration} min
                  </div>

                  <div className="card-bottom">
                    <button onClick={() => onSelectTest(t.id)}>
                      {isVi ? 'Mở đề thi →' : 'Open test →'}
                    </button>
                    <button
                      onClick={() => onToggleFavorite(t.id)}
                      aria-label={isFav ? 'Unfavorite test' : 'Favorite test'}
                      style={{
                        fontSize: '16px',
                        color: isFav ? '#b28d41' : 'var(--studio-muted)',
                      }}
                    >
                      {isFav ? '★' : '☆'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="studio-pagination">
              <button
                className="studio-quiet"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                ←
              </button>
              <span>
                {currentPage + 1} / {totalPages}
              </span>
              <button
                className="studio-quiet"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                →
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="studio-empty">
          <p style={{ fontWeight: 600, fontSize: '15px', marginBottom: '8px' }}>
            {isVi ? 'Chưa có đề thi nào trong thư viện.' : 'No tests in your library yet.'}
          </p>
          <p style={{ maxWidth: '480px', margin: '0 auto 16px' }}>
            {isVi
              ? 'Tải lên các tệp True IELTS ZIP hoặc HTML ban đầu trong trang Quản trị để xây dựng ngân hàng đề của bạn.'
              : 'Upload original True IELTS ZIP, HTML or JSON backup files in Admin Studio to build your test bank.'}
          </p>
          <button className="studio-primary" onClick={onNavigateToAdmin}>
            {isVi ? 'Đến Quản trị nội dung' : 'Open Admin Studio'}
          </button>
        </div>
      )}
    </div>
  );
};
