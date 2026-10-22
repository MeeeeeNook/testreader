import React,{useEffect,useState} from 'react';
import {Check,BookmarkPlus,X} from 'lucide-react';
import {lookupDictionary,vocabularyFromMeaning,type DictionaryEntry,type DictionaryMeaning} from '../services/dictionary';
export function DictionaryPanel({initialWord,onClose,onSave,sourceContext='',saveIntent=false}:{initialWord:string;onClose:()=>void;onSave:(item:{word:string;meaning:string;example:string;partOfSpeech:string})=>Promise<void>;sourceContext?:string;saveIntent?:boolean}) {
  const [input,setInput]=useState(initialWord),[word,setWord]=useState(initialWord),[entry,setEntry]=useState<DictionaryEntry|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [saved,setSaved]=useState<string[]>([]),[saving,setSaving]=useState(''),[success,setSuccess]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!word.trim())return;
    const controller=new AbortController();
    setSaved([]);setSuccess('');setEntry(null);setError('');setLoading(true);
    void lookupDictionary(word,controller.signal).then(value=>{if(!controller.signal.aborted)setEntry(value);}).catch(error=>{if(!controller.signal.aborted)setError(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[word,retry]);
  const save=async(meaning:DictionaryMeaning,key:string)=>{
    if(!entry||saving)return;
    setSaving(key);setError('');setSuccess('');
    try {await onSave(vocabularyFromMeaning(entry,meaning,sourceContext));setSaved(previous=>[...previous,key]);setSuccess(`“${entry.word}” saved to your vocabulary.`);}
    catch(error){setError((error as Error).message);}finally{setSaving('');}
  };
  return <aside className="dictionary-panel" aria-label="Dictionary"><header><div><small>{saveIntent?'SAVE VOCABULARY':'READING TOOL'}</small><h2>Dictionary</h2></div><button className="quiet-button" aria-label="Close dictionary" onClick={onClose}><X size={19}/></button></header>
    <form onSubmit={e=>{e.preventDefault();setWord(input.trim());setRetry(value=>value+1);}}><input aria-label="Dictionary word" value={input} onChange={e=>setInput(e.target.value)} placeholder="Look up a word" maxLength={80}/><button className="studio-primary">Look up</button></form>
    {saveIntent&&<p className="dictionary-save-hint">Choose the meaning used in your passage, then save it to your vocabulary.</p>}
    {loading&&<p role="status">Looking up…</p>}{error&&<p role="alert" className="dictionary-error">{error}</p>}{success&&<p role="status" className="dictionary-success"><Check size={17}/>{success}</p>}
    {entry&&<><h3>{entry.word}</h3>{entry.results.map((result,i)=><section key={i}><p>{result.pronunciations?.map(p=>p.ipa).join(' · ')}</p><audio controls preload="none" src={'https://dict.minhqnd.com/api/v1/tts?lang=en&word='+encodeURIComponent(entry.word)}/><ol>{result.meanings.slice(0,20).map((meaning,j)=>{const key=entry.word+':'+i+':'+j;return <li key={key}><small>{meaning.pos||'term'}</small><p>{meaning.definition}</p>{meaning.example&&<blockquote>{meaning.example}</blockquote>}<button className="quiet-button dictionary-save" disabled={!!saving||saved.includes(key)} onClick={()=>void save(meaning,key)}>{saved.includes(key)?<Check size={15}/>:<BookmarkPlus size={15}/>} {saving===key?'Saving…':saved.includes(key)?'Saved':'Save meaning'}</button></li>;})}</ol></section>)}</>}
    <p className="dictionary-attribution">Definitions: <a href="https://dict.minhqnd.com" target="_blank" rel="noreferrer">minhqnd Dictionary</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></p>
  </aside>;
}
