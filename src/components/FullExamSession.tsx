import React,{useEffect} from 'react';
import {createPortal} from 'react-dom';

// The live exam is a sibling of the site root, just like a standalone test.
// Catalog width limits and descendant styles must never apply to the reader.
export function FullExamSession({children}:{children:React.ReactNode}){
 useEffect(()=>{
  const root=document.getElementById('root');
  const previousOverflow=document.body.style.overflow;
  const previousInert=root?.inert||false;
  document.body.style.overflow='hidden';
  if(root)root.inert=true;
  return()=>{document.body.style.overflow=previousOverflow;if(root)root.inert=previousInert};
 },[]);
 return createPortal(<div className="full-exam-session" role="region" aria-label="Full test session">{children}</div>,document.body);
}
