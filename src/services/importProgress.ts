export interface ImportProgress {phase:'unpack'|'parse'|'verify'|'compress'|'upload'|'save';label:string;percent:number;detail?:string}
export type ImportProgressCallback=(progress:ImportProgress)=>void;
export function importError(error:unknown){
 const value=error as {code?:string;message?:string};
 const code=value?.code||'import/failed',message=value?.message||String(error);
 const help=code==='storage/unauthorized'?'Check Firebase Storage rules and your admin account.':code==='storage/quota-exceeded'?'Check the Firebase Storage quota and billing plan.':code==='storage/unauthenticated'?'Sign in again, then retry.':code==='storage/retry-limit-exceeded'||code==='storage/upload-timeout'?'Check your connection and Firebase Storage configuration, then retry a smaller batch.':'';
 return `[${code}] ${message}${help?' '+help:''}`;
}

export function withImportTimeout<T>(pending:Promise<T>,label:string,milliseconds=120000):Promise<T>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Object.assign(new Error(label+' has not confirmed completion after 120 seconds. A save may still finish in the background; check the library before importing again.'),{code:'import/save-timeout'})),milliseconds);
  pending.then(result=>{clearTimeout(timer);resolve(result)},error=>{clearTimeout(timer);reject(error)});
 });
}
