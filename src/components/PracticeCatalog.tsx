import {testLink} from "../services/testLinks";
import React, {useEffect, useRef, useState} from 'react';
import {needsCatalogRepair} from '../services/catalogRepair';
import {isGenericPassageTitle} from '../services/passageTitle';
import { BookOpen, Headphones, Search, SlidersHorizontal, ArrowUpRight, Layers } from 'lucide-react';
import type { TestMeta, UserProfile, AttemptRecord } from '../types';
import { catalogSections, questionTypes, answerPath, matchesSource } from '../services/portal';
import { compareTests, allFolderPaths, sortOptions } from '../services/catalog';
export function PracticeCatalog({tests,profile,attempts,full=false,category='',location,onNavigate,loadSummary}:{tests:TestMeta[];profile:UserProfile;attempts:AttemptRecord[];full?:boolean;category?:string;location:string;onNavigate:(path:string,replace?:boolean)=>void;loadSummary?:(test:TestMeta)=>Promise<Partial<TestMeta>>}) {
 const vi=false, params=new URL(location,'https://studio.local').searchParams;
 const skill=params.get('skill')==='listening'?'listening':'reading', q=params.get('q')||'', source=params.get('source')||'', order=params.get('sort')||'title', part=params.get('part')||'', kinds=(params.get('types')||'').split(',').filter(Boolean), done=params.get('done')||'';
 const path=full?`/full-tests${category?'/'+category:''}`:'/practice';
 const update=(values:Record<string,string>)=>{const next=new URLSearchParams(params);Object.entries(values).forEach(([k,v])=>v?next.set(k,v):next.delete(k));if(!('page' in values))next.delete('page');onNavigate(path+(next.size?'?'+next:''));};
 const [repairs,setRepairs]=useState<Record<string,Partial<TestMeta>>>({});
 const [repairError,setRepairError]=useState('');
 const [retry,setRetry]=useState(0);
 const attempted=useRef(new Set<string>());
 const repairedTests=tests.map(t=>({...t,...repairs[t.id]}));
 const repairKey=tests.map(t=>`${t.id}:${t.updatedAt}`).join('|');
 useEffect(()=>{
  if(full||!loadSummary)return;
  let alive=true,finished=false;
  const missing=tests.filter(t=>t.status==='published'&&t.skill===skill&&needsCatalogRepair({...t,...repairs[t.id]})&&!attempted.current.has(`${t.id}:${t.updatedAt}`)).slice(0,8);
  missing.forEach(t=>attempted.current.add(`${t.id}:${t.updatedAt}`));
  if(missing.length)void Promise.all(missing.map(async t=>{
    try {return [t.id,await loadSummary(t)] as const;}
    catch {if(alive)setRepairError(vi?'Chưa tải được tên một số bài. Vui lòng thử lại.':'Some passage titles could not load. Please retry.');return null;}
  })).then(results=>{finished=true;if(alive)setRepairs(previous=>({...previous,...Object.fromEntries(results.filter((r):r is NonNullable<typeof r>=>r!==null))}));});
  return ()=>{alive=false;if(!finished)missing.forEach(t=>attempted.current.delete(`${t.id}:${t.updatedAt}`));};
 },[repairKey,skill,full,Object.keys(repairs).length,retry]);
 const bank=repairedTests.filter(t=>t.status==='published'&&t.skill===skill&&matchesSource(t.originSource||t.source,category));
 const sorted=bank.filter(t=>(!source||t.source===source||t.source.startsWith(source+' / '))&&(!done||(done==='yes')===attempts.some(a=>a.testId===t.id))).sort((a,b)=>compareTests(a,b,order));
 const cards=sorted.flatMap<{test:TestMeta;section:ReturnType<typeof catalogSections>[number]|null}>(test=>full?(test.passages===(skill==='reading'?3:4)?[{test,section:null}]:[]):catalogSections(test).map(section=>({test,section}))).filter(({test,section})=>(!part||String((section?.index??-1)+1)===part)&&(!kinds.length||kinds.some(k=>section?.kinds.includes(k)))&&(!q||`${test.title} ${test.source} ${section?.title||''}`.toLowerCase().includes(q.toLowerCase())));
 const pages=Math.max(1,Math.ceil(cards.length/12)), page=Math.max(0,Math.min(pages-1,Number(params.get('page'))||0));
 const go=(e:React.MouseEvent,url:string)=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onNavigate(url);}};
 return <div className="practice-page"><div className="portal-page-heading"><div><span className="portal-eyebrow">{full?'THE FULL CHALLENGE':'YOUR DAILY PRACTICE'}</span><h1>{full?'Full Test':'Practice Test'}</h1><p>{full?(vi?'Đủ 3 passage Reading hoặc 4 section Listening.':'Complete tests with 3 reading passages or 4 listening sections.'):(vi?'Chọn một bài. Tập trung vào điều mình muốn cải thiện.':'Pick one passage or section and focus on what you want to improve.')}</p></div><a className="mix-test-button" href="/mock" onClick={e=>go(e,'/mock')}><Layers size={21}/><span><strong>Mix test</strong><small>{vi?'Tự ghép đề của mình':'Build your own test'}</small></span><ArrowUpRight size={21}/></a></div>
 <div className="portal-skill-tabs"><button className={skill==='reading'?'active':''} onClick={()=>update({skill:'reading',part:'',types:'',source:''})}><BookOpen size={25}/><span>Reading<small>Academic</small></span></button><button className={skill==='listening'?'active':''} onClick={()=>update({skill:'listening',part:'',types:'',source:''})}><Headphones size={25}/><span>Listening<small>Sections 1–4</small></span></button></div>
 {repairError&&<p role="alert" className="studio-callout">{repairError}<button onClick={()=>{attempted.current.clear();setRepairError('');setRetry(value=>value+1);}}>Retry</button></p>}
 <div className="catalog-layout"><aside className="catalog-filter-panel"><h2><SlidersHorizontal size={17}/>{vi?'Bộ lọc':'Filters'}<button onClick={()=>onNavigate(path+'?skill='+skill)}>{vi?'Xóa':'Reset'}</button></h2>
 {!full&&<fieldset><legend>{skill==='reading'?'Passage':'Section'}</legend><select aria-label="Passage or section" value={part} onChange={e=>update({part:e.target.value})}><option value="">{vi?'Tất cả':'All parts'}</option>{Array.from({length:skill==='reading'?3:4},(_,i)=><option key={i} value={i+1}>{skill==='reading'?'Passage':'Section'} {i+1}</option>)}</select></fieldset>}
 {!full&&<fieldset><legend>{vi?'Dạng câu hỏi':'Question type'}</legend>{questionTypes.map(([value,label])=><label key={value}><input type="checkbox" checked={kinds.includes(value)} onChange={e=>update({types:(e.target.checked?[...kinds,value]:kinds.filter(k=>k!==value)).join(',')})}/>{label}</label>)}</fieldset>}
 <fieldset><legend>{vi?'Nguồn / thư mục':'Folder'}</legend><select aria-label="Source folder" value={source} onChange={e=>update({source:e.target.value})}><option value="">{vi?'Tất cả nguồn':'All folders'}</option>{allFolderPaths(bank).map(folder=><option key={folder}>{folder}</option>)}</select></fieldset>
 <fieldset><legend>{vi?'Lịch sử':'My progress'}</legend><select aria-label="Attempt filter" value={done} onChange={e=>update({done:e.target.value})}><option value="">{vi?'Tất cả':'All'}</option><option value="yes">{vi?'Đã làm':'Attempted'}</option><option value="no">{vi?'Chưa làm':'Not attempted'}</option></select></fieldset>
 </aside><section className="catalog-results"><div className="catalog-result-tools"><form key={q} onSubmit={e=>{e.preventDefault();update({q:String(new FormData(e.currentTarget).get('q')||'')});}}><Search size={18}/><input name="q" aria-label="Search tests" defaultValue={q} placeholder={vi?'Tìm tên bài, tên đề…':'Search a passage or test…'}/><button type="submit">{vi?'Tìm':'Search'}</button></form><select aria-label="Sort tests" value={order} onChange={e=>update({sort:e.target.value})}>{sortOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="catalog-count"><strong>{cards.length}</strong> {full?'tests':skill==='reading'?'passages':'sections'}{category&&<span> · {category.toUpperCase()}</span>}</div>
 <div className="practice-card-grid">{cards.slice(page*12,page*12+12).map(({test,section})=>{const unresolved=section&&isGenericPassageTitle(section.title), title=unresolved?(repairs[test.id]?(vi?'Bài đọc chưa có tên':'Untitled passage'):(vi?'Đang tải tên bài…':'Loading passage title…')):section?.title||test.title, href=testLink(test,section);return <article className="practice-card" key={test.id+':'+section?.id}><div className={`practice-card-art ${skill}`}><span>{full?'FULL TEST':`${skill==='reading'?'PASSAGE':'SECTION'} ${(section?.index||0)+1}`}</span>{skill==='reading'?<BookOpen size={45} strokeWidth={1.2}/>:<Headphones size={45} strokeWidth={1.2}/>}<small>{vi?'Miễn phí':'Free'}</small></div><div className="practice-card-content"><div className="card-source">{test.source}</div><h2><a href={href} onClick={e=>go(e,href)}>{title}</a></h2><p>{section?(section.questions?`${section.questions} questions`:''):`${test.passages} ${skill==='reading'?'passages':'sections'} · ${test.questions} questions`}{section?'':` · ${test.duration} min`}</p><div className="practice-card-footer"><a href={href} onClick={e=>go(e,href)}>{vi?'Làm bài':'Start test'} <ArrowUpRight size={15}/></a><a href={testLink(test,section,true)}>{vi?'Đáp án':'Answers'}</a></div></div></article>})}</div>
 {!cards.length&&<div className="portal-empty"><BookOpen size={35}/><h2>{vi?'Chưa có bài phù hợp':'No matching tests'}</h2><p>{vi?'Thử bỏ bớt bộ lọc hoặc tìm một tên bài khác.':'Try changing your filters or searching for another title.'}</p></div>}
 {pages>1&&<nav className="portal-pagination" aria-label="Catalog pages"><button disabled={!page} onClick={()=>update({page:String(page-1)})}>←</button><span>{page+1} / {pages}</span><button disabled={page>=pages-1} onClick={()=>update({page:String(page+1)})}>→</button></nav>}
 </section></div></div>;
}

