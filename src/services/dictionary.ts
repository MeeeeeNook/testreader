export interface DictionaryMeaning {definition:string;example?:string;pos?:string;definition_lang?:string}
export interface DictionaryEntry {source?:'minhqnd'|'wiktionary';word:string;results:{pronunciations?:{ipa:string;region:string}[];meanings:DictionaryMeaning[]}[]}
const cache=new Map<string,DictionaryEntry>();
function dictionaryText(html:string):string {
  if(typeof DOMParser!=='undefined')return new DOMParser().parseFromString(html,'text/html').body.textContent?.trim()||'';
  const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return html.replace(/<[^>]*>/g,'').replace(/&([a-z]+);/gi,(match,name)=>entities[name]??match).trim();
}

export async function lookupDictionary(word:string,signal?:AbortSignal,fetcher:typeof fetch=fetch):Promise<DictionaryEntry> {
  const key=word.trim().toLowerCase();
  if(!/^[a-zA-Z][a-zA-Z '\u2019-]{0,79}$/.test(key))throw new Error('Enter an English word or short phrase.');
  if(cache.has(key))return cache.get(key)!;
  const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000);
  let entry:DictionaryEntry|undefined;
  try {
    const response=await fetcher('https://dict.minhqnd.com/api/v1/lookup?lang=en&word='+encodeURIComponent(key),{signal:requestSignal});
    if(response.ok){
      const value=await response.json();
      const results=Array.isArray(value.results)?value.results.filter((result:any)=>Array.isArray(result.meanings)).map((result:any)=>({...result,meanings:result.meanings.filter((meaning:any)=>typeof meaning.definition==='string'&&meaning.definition.trim())})).filter((result:any)=>result.meanings.length):[];
      if(value.exists&&results.length)entry={word:typeof value.word==='string'?value.word:key,results,source:'minhqnd'};
    }
  }catch{if(signal?.aborted)throw new DOMException('Lookup cancelled.','AbortError');}
  if(!entry){
    if(signal?.aborted)throw new DOMException('Lookup cancelled.','AbortError');
    let response:Response;
    try {response=await fetcher('https://en.wiktionary.org/api/rest_v1/page/definition/'+encodeURIComponent(key),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});}
    catch(error){if(signal?.aborted)throw new DOMException('Lookup cancelled.','AbortError');throw new Error('The dictionaries are unavailable. Please retry.');}
    if(response.status===404)throw new Error('No definition found in either dictionary. Check the spelling or try the base form.');
    if(!response.ok)throw new Error('Dictionary unavailable. Please retry.');
    const value=await response.json();
    const meanings=Array.isArray(value.en)?value.en.flatMap((item:any)=>Array.isArray(item.definitions)?item.definitions.filter((definition:any)=>typeof definition.definition==='string'&&definition.definition.trim()).map((definition:any)=>({definition:dictionaryText(definition.definition),example:dictionaryText(definition.parsedExamples?.[0]?.example||definition.examples?.[0]||''),pos:typeof item.partOfSpeech==='string'?item.partOfSpeech.toLowerCase():'term',definition_lang:'en'})):[]):[];
    const results=meanings.length?[{meanings}]:[];
    if(!results.length)throw new Error('No definition found in either dictionary. Check the spelling or try the base form.');
    entry={word:key,results,source:'wiktionary'};
  }
  if(cache.size>=200)cache.delete(cache.keys().next().value!);
  cache.set(key,entry);return entry;
}

// Save all dictionary senses, rather than guessing a meaning from the passage.
export async function lookupVocabulary(word:string,context='') {
  const entry=await lookupDictionary(word);
  const meanings=entry.results.flatMap(result=>result.meanings);
  const unique=[...new Set(meanings.map(meaning=>meaning.definition.trim()))];
  const parts=[...new Set(meanings.map(meaning=>meaning.pos?.trim()).filter((part):part is string=>!!part))];
  return {word:entry.word,meaning:unique.join('\n'),partOfSpeech:parts.join(' · ')||'term',example:meanings.find(meaning=>meaning.example)?.example||context,dictionarySource:entry.source||'minhqnd',definitionLanguage:entry.source==='wiktionary'?'en':meanings[0]?.definition_lang||'',phonetic:entry.results.flatMap(result=>result.pronunciations||[]).find(pronunciation=>pronunciation.ipa)?.ipa||''};
}

export function vocabularyFromMeaning(entry:DictionaryEntry,meaning:DictionaryMeaning,context='') {
  return {word:entry.word,meaning:meaning.definition,example:meaning.example||context,partOfSpeech:meaning.pos||'term',dictionarySource:entry.source||'minhqnd',definitionLanguage:meaning.definition_lang||'',phonetic:entry.results.flatMap(result=>result.pronunciations||[]).find(pronunciation=>pronunciation.ipa)?.ipa||''};
}
