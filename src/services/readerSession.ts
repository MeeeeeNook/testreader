export function readerSessionKey(owner:string,session:string,mode:'practice'|'exam',solution=false,preview=false) {
  // v4 deliberately ignores v3 records: solution pages previously overwrote live attempts.
  return `reading-room:v4:${owner}:${session}:${solution?'solution':mode}${preview?':preview':''}`;
}

export function readReaderSession(storage:Pick<Storage,'getItem'>,key:string,solution=false) {
  if(solution)return {};
  try {
    const saved=JSON.parse(storage.getItem(key)||'{}');
    return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
  }catch{return {};}
}
