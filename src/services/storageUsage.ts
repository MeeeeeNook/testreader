export const formatBytes=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1024**2?`${(bytes/1024).toFixed(1)} KB`:bytes<1024**3?`${(bytes/1024**2).toFixed(2)} MB`:`${(bytes/1024**3).toFixed(2)} GB`;

export function summarizeFiles(files:{name:string;size:number}[]) {
  return {bytes:files.reduce((sum,file)=>sum+file.size,0),count:files.length,largest:[...files].sort((a,b)=>b.size-a.size).slice(0,20)};
}
