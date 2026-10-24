export async function loadWithRecovery<T>(load:()=>Promise<T>,name:string,browser:Pick<Window,'location'|'sessionStorage'>|undefined=typeof window==='undefined'?undefined:window):Promise<T>{
 const key='ielts:module-recovery:'+name;
 try{const result=await load();try{browser?.sessionStorage.removeItem(key)}catch{}return result}
 catch(error){
  const message=error instanceof Error?error.message:String(error);
  if(browser&&/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .*failed/i.test(message)){
   try{const previous=Number(browser.sessionStorage.getItem(key)||0),now=Date.now();if(!previous||now-previous>30000){browser.sessionStorage.setItem(key,String(now));browser.location.reload()}}catch{}
  }
  throw error;
 }
}
