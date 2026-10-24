import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {lookupDictionary,lookupVocabulary} from '../src/services/dictionary';
import {VocabularyView} from '../src/components/VocabularyView';

test('an ordinary word missing from the Vietnamese source falls back to English and saves real definitions with provenance',async()=>{
 const calls:string[]=[];
 const entry=await lookupDictionary('district',undefined,async(url:any)=>{
  calls.push(String(url));
  if(String(url).includes('minhqnd'))return new Response('{"exists":false}',{status:404});
  return new Response(JSON.stringify({en:[{partOfSpeech:'Noun',definitions:[{definition:'An <a href="/wiki/administrative">administrative</a> division of an area.',examples:['The school serves this <b>district</b>.']}]}],fr:[{partOfSpeech:'Noun',definitions:[{definition:'French text must not be mixed in.'}]}]}));
 });
 assert.equal(calls.length,2);assert.match(calls[1],/en\.wiktionary\.org\/api\/rest_v1\/page\/definition\/district$/);
 assert.equal(entry.source,'wiktionary');
 const saved=await lookupVocabulary('district','A very long paragraph from the passage.');
 assert.equal(saved.meaning,'An administrative division of an area.');assert.equal(saved.partOfSpeech,'noun');assert.equal(saved.definitionLanguage,'en');assert.equal(saved.dictionarySource,'wiktionary');assert.equal(saved.phonetic,'');assert.equal(saved.example,'The school serves this district.');
});
test('cancelled dictionary lookups do not start a second request',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(lookupDictionary('cancelledword',controller.signal,async()=>{calls++;controller.abort();throw new DOMException('Cancelled','AbortError');}),{name:'AbortError'});assert.equal(calls,1);
});
test('notebook table displays numbered meanings and the requested example column',()=>{
 const html=renderToStaticMarkup(React.createElement(VocabularyView,{onUpdateProfile:async()=>{},profile:{id:'learner'} as any,vocabulary:[{id:'one',word:'handful',meaning:'A small amount.\nA troublesome person.',partOfSpeech:'noun',example:'An entire irrelevant paragraph copied from the passage.',dictionarySource:'minhqnd'} as any],onSaveWord:async()=>{},onArchiveWord:async()=>{},onNotify:()=>{}}));
 assert.match(html,/<ol class="vocab-meanings">/);assert.match(html,/A small amount/);assert.match(html,/A troublesome person/);assert.match(html,/<th>Example<\/th>/);assert.match(html,/irrelevant paragraph/);assert.doesNotMatch(html,/blockquote|Needs definition/);
});
