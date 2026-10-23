import React, {useState} from 'react';
import {Modal} from './Modal';
import {FileDown,X} from 'lucide-react';
import type {EditableTest} from '../types';
export function ExportDialog({test,loadKeys,loadTranscripts,onClose}:{test:EditableTest;loadKeys:()=>Promise<Record<number,any>>;loadTranscripts?:()=>Promise<Record<string,string>>;onClose:()=>void}) {
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  const [content,setContent]=useState<'worksheet'|'answers'|'explanations'>('worksheet');
  const run=async(format:'pdf'|'docx')=>{
    setBusy(format);setError('');
    try {
      // Homework worksheets never request keys or depend on the scoring service.
      const keys=content==='worksheet'?{}:await loadKeys();
      const full={...test,parts:test.parts.map(p=>({...p,questions:p.questions.map(q=>({...q,...keys[q.number]}))}))};
      const {exportReadingDocument}=await import('../services/documentExport');
      await exportReadingDocument(full,format,true,{includeAnswers:content!=='worksheet',includeExplanations:content==='explanations'});
      onClose();
    }catch(e){setError((e as Error).message);}finally{setBusy('');}
  };
  const audio=async()=>{setBusy('audio');setError('');try{const {downloadListeningAudio}=await import('../services/listeningExport');await downloadListeningAudio(test)}catch(e){setError((e as Error).message)}finally{setBusy('')}};
  const transcript=async(format:'pdf'|'docx'|'txt')=>{setBusy('transcript');setError('');try{const transcripts=loadTranscripts?await loadTranscripts():Object.fromEntries(test.parts.map(p=>[p.id,p.passageHtml]));const full={...test,title:test.title+' — Transcript',parts:test.parts.map(p=>({...p,passageHtml:transcripts[p.id]||''}))};if(!full.parts.some(p=>p.passageHtml.trim()))throw Error('No transcript was provided for this test.');if(format==='txt'){const {saveDownload,transcriptText}=await import('../services/listeningExport');saveDownload(new Blob([transcriptText(full)],{type:'text/plain;charset=utf-8'}),test.title.replace(/[\\/:*?"<>|]/g,'_')+'-transcript.txt')}else{const {exportReadingDocument}=await import('../services/documentExport');await exportReadingDocument(full,format,true,{includeAnswers:false,includeExplanations:false,transcriptOnly:true})}}catch(e){setError((e as Error).message)}finally{setBusy('')}};
  return <Modal className="export-dialog" label={test.skill==='listening'?'Export listening test':'Export reading test'} onClose={onClose} busy={!!busy}>
    <button className="export-close quiet-button" aria-label="Close export" disabled={!!busy} onClick={onClose}><X size={20}/></button>
    <span className="export-icon"><FileDown size={28}/></span><h2>Download or print your test</h2><p>Choose what to include in your homework handout.</p>
    <fieldset className="export-content-choices" disabled={!!busy}><legend>Document contents</legend>{([
      ['worksheet','Questions only','A clean worksheet with no answers or explanations.'],
      ['answers','Questions and answer key','An answer table at the end of the document.'],
      ['explanations','Questions, answers and explanations','Include the full solution guide.']
    ] as const).map(([value,title,description])=><label key={value} className={content===value?'selected':''}><input type="radio" name="export-content" value={value} checked={content===value} onChange={()=>setContent(value)}/><span><strong>{title}</strong><small>{description}</small></span></label>)}</fieldset>
    <div className="export-format-choices"><button className="studio-primary" disabled={!!busy} onClick={()=>void run('pdf')}>PDF / Print</button><button className="studio-secondary" disabled={!!busy} onClick={()=>void run('docx')}>Word (.docx)</button></div>
    {test.skill==='listening'&&<section className="listening-downloads"><h3>Listening files</h3><p>Download original recordings or a separate transcript document.</p><div className="studio-actions"><button className="studio-secondary" disabled={!!busy} onClick={()=>void audio()}>Audio files (.zip)</button><button className="studio-secondary" disabled={!!busy} onClick={()=>void transcript('pdf')}>Transcript PDF</button><button className="studio-secondary" disabled={!!busy} onClick={()=>void transcript('docx')}>Transcript Word</button><button className="quiet-button" disabled={!!busy} onClick={()=>void transcript('txt')}>Transcript text</button></div></section>}
    {busy&&<p role="status">Preparing your document…</p>}{error&&<p role="alert">{error}</p>}
  </Modal>;
}
