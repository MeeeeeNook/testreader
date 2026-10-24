export const LIBRARY_DRAG_TYPE='application/x-ielts-library';
export type LibraryDrag={kind:'tests';ids:string[]}|{kind:'folder';id:string};
export function readLibraryDrag(data:Pick<DataTransfer,'getData'>):LibraryDrag|null {
 try {const value=JSON.parse(data.getData(LIBRARY_DRAG_TYPE));
  if(value.kind==='folder'&&typeof value.id==='string'&&value.id)return {kind:'folder',id:value.id};
  if(value.kind==='tests'&&Array.isArray(value.ids)&&value.ids.length&&value.ids.every((id:unknown)=>typeof id==='string'&&id))return {kind:'tests',ids:[...new Set<string>(value.ids)]};
 }catch{}return null;
}
export function startLibraryDrag(data:DataTransfer,value:LibraryDrag){data.setData(LIBRARY_DRAG_TYPE,JSON.stringify(value));data.effectAllowed='move';}
export function acceptsLibraryDrag(data:Pick<DataTransfer,'types'>){return Array.from(data.types).includes(LIBRARY_DRAG_TYPE);}
