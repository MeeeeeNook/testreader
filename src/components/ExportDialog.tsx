import React, {useState} from 'react';
import {Modal} from './Modal';
import {FileDown,X} from 'lucide-react';
import type {EditableTest} from '../types';
export function ExportDialog({test,loadKeys,loadTranscripts,onClose}:{test:EditableTest;loadKeys:()=>Promise<Record<number,any>>;loadTranscripts?:()=>Promise<Record<string,string>>;onClose:()=>void}) {
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const [choices,setChoices]=useState({questions:true,answers:false,explanations:false,transcript:false});
 const run=async(format:'pdf'|'docx')=>{
  setBusy(format);setError('');
  try {
   const keys=choices.answers||choices.explanations?await loadKeys():{};
   const transcripts=choices.transcript?(loadTranscripts?await loadTranscripts():Object.fromEntries(test.parts.map(p=>[p.id,p.passageHtml]))):{};
   if(choices.transcript&&!Object.values(transcripts).some(t=>t.trim()))throw Error('No transcript was provided for this test.');
   const full={...test,title:choices.transcript&&!choices.questions&&!choices.answers&&!choices.explanations?test.title+' - Transcript':test.title,parts:test.parts.map(p=>({...p,passageHtml:choices.transcript?transcripts[p.id]||'':p.passageHtml,questions:p.questions.map(q=>({...q,...keys[q.number]}))}))};
   const {exportReadingDocument}=await import('../services/documentExport');
   await exportReadingDocument(full,format,true,{includeQuestions:choices.questions,includeAnswers:choices.answers,includeExplanations:choices.explanations,includeTranscript:choices.transcript});
   onClose();
  }catch(e){setError((e as Error).message);}finally{setBusy('');}
 };
 const audio=async()=>{setBusy('audio');setError('');try{const {downloadListeningAudio}=await import('../services/listeningExport');await downloadListeningAudio(test)}catch(e){setError((e as Error).message)}finally{setBusy('')}};
 const options=[['questions','Questions','A clean worksheet for practice.'],['answers','Answers','Include the answer key.'],['explanations','Explanations','Include the explanation for each question.'],...(test.skill==='listening'?[['transcript','Transcript','Include the recording transcript.']]:[])];
 return <Modal className="export-dialog" label={test.skill==='listening'?'Export listening test':'Export reading test'} onClose={onClose} busy={!!busy}>
  <button className="export-close quiet-button" aria-label="Close export" disabled={!!busy} onClick={onClose}><X size={20}/></button>
  <span className="export-icon"><FileDown size={28}/></span><h2>Download or print your test</h2><p>Choose exactly what to include in your document.</p>
  <fieldset className="export-content-choices" disabled={!!busy}><legend>Document contents</legend>{options.map(([value,title,description])=><label key={value} className={choices[value as keyof typeof choices]?'selected':''}><input type="checkbox" checked={choices[value as keyof typeof choices]} onChange={e=>setChoices({...choices,[value]:e.target.checked})}/><span><strong>{title}</strong><small>{description}</small></span></label>)}</fieldset>
  <div className="export-format-choices"><button className="studio-secondary" disabled={!!busy||!Object.values(choices).some(Boolean)} onClick={()=>void run('pdf')}>PDF / Print</button><button className="studio-secondary" disabled={!!busy||!Object.values(choices).some(Boolean)} onClick={()=>void run('docx')}>Word (.docx)</button></div>
  {test.skill==='listening'&&<section className="listening-downloads"><h3>Recordings</h3><button className="studio-secondary" disabled={!!busy} onClick={()=>void audio()}>Audio files (.zip)</button></section>}
  {busy&&<p role="status">Preparing your download…</p>}{error&&<p role="alert">{error}</p>}
 </Modal>;
}
