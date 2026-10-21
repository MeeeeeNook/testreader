import React from 'react';
import { UserProfile } from '../types';

interface NavigationProps {
  route: string;
  onNavigate: (route: string) => void;
  isAdmin: boolean;
  profile: UserProfile;
  storageConnected: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  route,
  onNavigate,
  isAdmin,
  profile,
  storageConnected,
}) => {
  const isVi = profile.language === 'vi';

  const navItems = [
    { id: 'library', symbol: '▤', label: isVi ? 'Thư viện đề thi' : 'Test library' },
    { id: 'mock', symbol: '◷', label: isVi ? 'Thi thử đầy đủ' : 'Full mock test' },
    { id: 'progress', symbol: '↗', label: isVi ? 'Tiến độ của tôi' : 'My progress' },
    { id: 'vocabulary', symbol: 'Aa', label: isVi ? 'Sổ từ vựng' : 'Vocabulary' },
    { id: 'settings', symbol: '⚙', label: isVi ? 'Cài đặt & dữ liệu' : 'Settings & data' },
  ];

  if (isAdmin) {
    navItems.push({
      id: 'admin',
      symbol: '◇',
      label: isVi ? 'Quản trị nội dung' : 'Admin studio',
    });
  }

  return (
    <aside className="studio-nav">
      <a
        href="#library"
        className="studio-brand"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('library');
        }}
      >
        <div className="studio-logo">
          R<span>•</span>
        </div>
        <div>
          Reading<br />
          <b>Studio</b>
        </div>
      </a>

      <div className="studio-nav-label">
        {isVi ? 'KHÔNG GIAN HỌC TẬP' : 'YOUR STUDY SPACE'}
      </div>

      <nav>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={route === item.id || (route === 'editor' && item.id === 'admin') ? 'active' : ''}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-symbol">{item.symbol}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="studio-nav-bottom">
        <div>
          <span className="status-dot"></span>
          <span>{storageConnected ? 'Cloud Firestore Sync' : 'Local Workspace'}</span>
        </div>
        <p style={{ marginTop: '12px', font: '14px/1.5 var(--studio-serif)', color: 'var(--studio-muted)' }}>
          {isVi ? 'Nhịp độ của bạn.\nChương mới của bạn.' : 'Your own pace.\nYour next chapter.'}
        </p>
      </div>
    </aside>
  );
};
