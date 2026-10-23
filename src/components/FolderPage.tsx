import React from 'react';
import {PracticeCatalog} from './PracticeCatalog';
import {folderLocation,type LibraryFolder} from '../services/folders';
import type {TestMeta,UserProfile,AttemptRecord} from '../types';
export function FolderPage({id,folders,tests,profile,attempts,location,onNavigate,loadSummary,loading=false}:{id:string;folders:LibraryFolder[];tests:TestMeta[];profile:UserProfile;attempts:AttemptRecord[];location:string;onNavigate:(path:string)=>void;loading?:boolean;loadSummary?:(test:TestMeta)=>Promise<Partial<TestMeta>>}) {
 const folder=folders.find(item=>item.id===id&&folderLocation(item.id,folders));
 if(!folder)return <div className="portal-empty"><h1>{loading?'Opening collection…':'Folder unavailable'}</h1><p>{loading?'Loading the library.':'This folder may have been moved or removed.'}</p><a href="/practice">Browse the library</a></div>;
 const full=new URL(location,'https://studio.local').searchParams.get('view')!=='practice';
 return <PracticeCatalog tests={tests} folders={folders} folder={folder} full={full} profile={profile} attempts={attempts} location={location} onNavigate={onNavigate} loadSummary={loadSummary}/>;
}
