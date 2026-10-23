import React,{Children,isValidElement,useState} from 'react';
/** Shared dense table and footer; pagination never makes extra database requests. */
export function PaginatedTable({children,className='',...props}:React.TableHTMLAttributes<HTMLTableElement>){
 const [size,setSize]=useState(10),[page,setPage]=useState(0);
 const nodes=Children.toArray(children),body=nodes.find(n=>isValidElement(n)&&n.type==='tbody') as React.ReactElement<{children:React.ReactNode}>|undefined;
 const rows=Children.toArray(body?.props.children),pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(page,pages-1);
 return <div className="admin-data-table"><div className="admin-table-scroll"><table {...props} className={'studio-table '+className}>{nodes.map(n=>n===body?React.cloneElement(body!,{},rows.slice(current*size,(current+1)*size)):n)}</table></div><footer className="admin-table-footer"><span>{rows.length?current*size+1:0}–{Math.min((current+1)*size,rows.length)} of {rows.length}</span><label>Rows per page:<select aria-label="Rows per page" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(0)}}>{[10,25,50,100].map(v=><option key={v}>{v}</option>)}</select></label><button type="button" aria-label="Previous page" disabled={!current} onClick={()=>setPage(current-1)}>‹</button><span>{current+1} / {pages}</span><button type="button" aria-label="Next page" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>›</button></footer></div>;
}
