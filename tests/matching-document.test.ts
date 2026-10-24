import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import JSZip from 'jszip';
import {toEditable} from '../src/services/importer';
import {exportReadingDocument,readingDocument,printableHtml} from '../src/services/documentExport';
const dom=()=>{const {window}=parseHTML('<html><body></body></html>');Object.assign(globalThis,{document:window.document,Node:window.Node});};
const options={includeAnswers:false,includeExplanations:false};
async function paragraphs(test:any){const blob=await exportReadingDocument(test,'docx',false,options);const xml=await(await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml')!.async('string');return [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(match=>[...match[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(text=>text[1]).join(''));}
test('imported Matching people statements become separate Word paragraphs, preserving names and question numbers',async()=>{
 dom();const statements=['The use of guard dogs may save the lives of both livestock and wild animals.','Claims of a change in behaviour may not be totally accurate.','There may be negative results if guard dogs are not sufficiently widespread.','Guard dogs work best when appropriately handled.','Teaching a livestock guard dog requires a different focus.'];
 const input='<h3>Questions 32-36</h3><p>Match each statement with the correct person.</p><p>NB: You may use any letter more than once.</p><p>List of People</p><p>A. Dan Macon</p><p>B. Silvia Ribeiro</p><div class="question matching_names">'+statements.map((text,i)=>`<div class="item-question" id="question-${i+32}"><span class="label"><b class="number">${i+32}</b>${text}</span><input value="A"><input value="B"></div>`).join('')+'<span class="number-alphabet">A</span><span class="number-alphabet">B</span></div>';
 const test=toEditable({title:'Guard dogs',parts:[{topic_content:'<p>A passage about guard dogs.</p>',questions:[32,33,34,35,36],question_content:input}]},{skill:'reading'});const before=test.parts[0].questionHtml;
 const output=await paragraphs(test);for(const [i,text]of statements.entries()){const row=output.filter(p=>p.includes(text));assert.equal(row.length,1);assert.match(row[0],new RegExp('^'+(32+i)+'\\. '));assert.equal(statements.filter(statement=>row[0].includes(statement)).length,1);assert.match(row[0],/__________/);}
 assert.ok(output.includes('A. Dan Macon'));assert.ok(output.includes('B. Silvia Ribeiro'));assert.equal(test.parts[0].questionHtml,before);assert.doesNotMatch(before,/data-export-question/);
});
test('Matching information keeps inline numbered stems in separate Word paragraphs and preserves inline emphasis',async()=>{
 dom();const texts=['a description of two early experiments','a reference to the cost of equipment','an explanation of why the first trial failed'];
 const part:any={id:'p1',title:'Research',passageHtml:'<p>Research passage.</p>',questionHtml:'<h3>Questions 14-16</h3><p>Which paragraph contains the following information?</p><p>'+texts.map((text,i)=>`<strong>${14+i}.</strong> <em>${text}</em> <span data-slot="s${i}"></span> `).join('')+'</p>',slots:Object.fromEntries(texts.map((_,i)=>['s'+i,{id:'s'+i,type:'select',numbers:[14+i],label:'',options:['A','B','C'].map(value=>({value,label:value}))}])),questions:texts.map((_,i)=>({number:14+i,kind:'matching_info',answer:'PRIVATE_KEY'}))};
 const test:any={title:'Information matching',skill:'reading',parts:[part]};const output=await paragraphs(test);
 for(const [i,text]of texts.entries()){const row=output.filter(p=>p.includes(text));assert.equal(row.length,1);assert.match(row[0],new RegExp('^'+(14+i)+'\\.'));assert.doesNotMatch(row[0],new RegExp('\\('+(14+i)+'\\)'));assert.equal(texts.filter(statement=>row[0].includes(statement)).length,1);}
 const blocks=readingDocument(test,options).filter(b=>b.kind==='text');assert.ok(blocks.some(b=>b.kind==='text'&&b.runs?.some(run=>run.italic&&run.text===texts[0])));assert.doesNotMatch(output.join(' '),/PRIVATE_KEY/);
});
test('ordinary sentence completion blanks stay together in their original paragraph',()=>{
 dom();const part:any={slots:{s1:{id:'s1',type:'text',numbers:[1],label:'',options:[]},s2:{id:'s2',type:'text',numbers:[2],label:'',options:[]}},questions:[{number:1,kind:'fill_blank'},{number:2,kind:'fill_blank'}]};
 const root=printableHtml('<p>The first <span data-slot="s1"></span> and second <span data-slot="s2"></span> belong in this sentence.</p>',part);assert.equal(root.querySelectorAll('p').length,1);assert.equal(root.querySelector('[data-export-question]'),null);assert.match(root.textContent!,/first.*second.*sentence/);
});
