import React, {useEffect,useRef} from 'react';

export function Modal({children,className='',label,onClose,busy=false}:{children:React.ReactNode;className?:string;label:string;onClose:()=>void;busy?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const element=ref.current;
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow||'';
    document.body.style.overflow='hidden';
    if(element?.showModal)element.showModal();else element?.setAttribute('open','');
    return()=>{element?.close?.();document.body.style.overflow=overflow;previous?.focus?.();};
  },[]);
  return <dialog ref={ref} className={`studio-modal centered-modal ${className}`} aria-label={label} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onClick={e=>{
    if(busy||e.target!==e.currentTarget)return;
    const rect=e.currentTarget.getBoundingClientRect();
    if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();
  }}>{children}</dialog>;
}
