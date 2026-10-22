import React,{useId} from 'react';
export const DEFAULT_READING_SIZE=18;
export const readingSize=(value?:number)=>Math.max(14,Math.min(22,Number(value)||DEFAULT_READING_SIZE));

export function FontSizeSlider({value,onChange,label='Font size'}:{value:number;onChange:(value:number)=>void;label?:string}) {
  const id=useId();
  return <div className="font-size-control"><div className="font-size-heading"><label htmlFor={id}>{label}</label><output htmlFor={id}>{value}px</output></div>
    <input id={id} aria-label={label} type="range" min={14} max={22} step={1} value={value} aria-valuetext={`${value} pixels${value===DEFAULT_READING_SIZE?' (default)':''}`} onChange={e=>onChange(Number(e.target.value))}/>
    <div className="font-size-scale"><span>Smaller</span><button type="button" onClick={()=>onChange(DEFAULT_READING_SIZE)} aria-label="Reset font size to default">Default · 18px</button><span>Larger</span></div>
  </div>;
}
