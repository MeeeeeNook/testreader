import React from 'react';
import { Folder, ChevronRight } from 'lucide-react';
import type { TestMeta } from '../types';
import { folderChildren, folderPath } from '../services/catalog';
export function FolderBrowser({tests, value, onChange}: {tests: TestMeta[]; value: string; onChange: (path: string) => void}) {
  const segments = folderPath(value).split(' / ').filter(Boolean);
  const children = folderChildren(tests, value);
  return <section className="folder-browser" aria-label="Test folders">
    <nav className="folder-breadcrumbs" aria-label="Folder breadcrumb">
      <button type="button" onClick={() => onChange('')} aria-current={!value ? 'page' : undefined}>All folders</button>
      {segments.map((name, index) => <React.Fragment key={index}><ChevronRight size={14}/><button type="button" aria-current={index === segments.length - 1 ? 'page' : undefined} onClick={() => onChange(segments.slice(0, index + 1).join(' / '))}>{name}</button></React.Fragment>)}
    </nav>
    {children.length > 0 && <div className="folder-grid">{children.map(([path,count]) => <button type="button" key={path} className="folder-card" onClick={() => onChange(path)}><Folder size={21}/><span>{path.split(' / ').at(-1)}</span><small>{count} tests</small></button>)}</div>}
  </section>;
}
