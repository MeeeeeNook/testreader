export interface DictionaryMeaning {definition:string;example?:string;pos?:string}
export interface DictionaryEntry {word:string;results:{pronunciations?:{ipa:string;region:string}[];meanings:DictionaryMeaning[]}[]}
const cache=new Map<string,DictionaryEntry>();

export async function lookupDictionary(word:string,signal?:AbortSignal,fetcher:typeof fetch=fetch):Promise<DictionaryEntry> {
  const key=word.trim().toLowerCase();
  if(!/^[a-zA-Z][a-zA-Z '\u2019-]{0,79}$/.test(key))throw new Error('Enter an English word or short phrase.');
  if(cache.has(key))return cache.get(key)!;
  let response:Response;
  try {response=await fetcher('https://dict.minhqnd.com/api/v1/lookup?lang=en&word='+encodeURIComponent(key),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});}
  catch(error){if((error as Error).name==='TimeoutError')throw new Error('The dictionary timed out. Please retry.');throw error;}
  if(response.status===404)throw new Error('No definition found. Try the base form or correct the selected word.');
  if(!response.ok)throw new Error('Dictionary unavailable. Please retry.');
  const value=await response.json();
  if(!value.exists||!Array.isArray(value.results))throw new Error('No definition found. Try another word.');
  const results=value.results.filter((result:any)=>Array.isArray(result.meanings)).map((result:any)=>({...result,meanings:result.meanings.filter((meaning:any)=>typeof meaning.definition==='string'&&meaning.definition.trim())})).filter((result:any)=>result.meanings.length);
  if(!results.length)throw new Error('No definition found. Try another word.');
  const entry:DictionaryEntry={word:typeof value.word==='string'?value.word:key,results};
  if(cache.size>=200)cache.delete(cache.keys().next().value!);
  cache.set(key,entry);return entry;
}

// Save all dictionary senses, rather than guessing a meaning from the passage.
export async function lookupVocabulary(word:string,context='') {
  const entry=await lookupDictionary(word);
  const meanings=entry.results.flatMap(result=>result.meanings);
  const unique=[...new Set(meanings.map(meaning=>meaning.definition.trim()))];
  const parts=[...new Set(meanings.map(meaning=>meaning.pos?.trim()).filter((part):part is string=>!!part))];
  return {word:entry.word,meaning:unique.join('\n'),partOfSpeech:parts.join(' · ')||'term',example:context||meanings.find(meaning=>meaning.example)?.example||''};
}

export function vocabularyFromMeaning(entry:DictionaryEntry,meaning:DictionaryMeaning,context='') {
  return {word:entry.word,meaning:meaning.definition,example:meaning.example||context,partOfSpeech:meaning.pos||'term'};
}
