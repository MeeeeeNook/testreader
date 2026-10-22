import {testLink} from "../src/services/testLinks";
import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PracticeCatalog} from '../src/components/PracticeCatalog.tsx';
import {HomeView} from '../src/components/HomeView.tsx';
import {countsAsAttempt, sectionSummaries, answerPath} from '../src/services/portal.ts';
import {parseRoute} from '../src/services/browserHistory.js';
import {validateContribution} from '../server/portalRoutes.ts';
import {publicPage,textMarkup,solutionBody} from '../server/publicPages.ts';
import type {TestMeta, UserProfile} from '../src/types.ts';
const profile:UserProfile={id:'guest',name:'Learner',email:'',target:7,language:'vi',theme:'light',fontSize:18,favorites:[],status:'active'};
const meta:TestMeta={id:'forecast',title:'Forecast Test 1',source:'Forecast / Q3',skill:'reading',access:'premium',status:'published',duration:60,passages:3,questions:40,updatedAt:1,sectionSummaries:[{id:'p0',index:0,title:'Airborne Dentists',questions:13,kinds:['heading']},{id:'p1',index:1,title:'Australian birds',questions:13,kinds:['true_false']},{id:'p2',index:2,title:'Living with robots',questions:14,kinds:['summary']}]};
const render=(location:string,full=false)=>renderToStaticMarkup(React.createElement(PracticeCatalog,{tests:[meta],profile,attempts:[],full,location,onNavigate:()=>{}}));
test('practice lists actual section names and section URLs; legacy premium labels never lock tests',()=>{
 const html=render('/practice');assert.match(html,/Airborne Dentists/);assert.match(html,/Australian birds/);assert.match(html,/Living with robots/);assert.ok(html.includes(testLink(meta,meta.sectionSummaries![0])));assert.doesNotMatch(html,/Premium|unlock|paid/);assert.ok(html.includes(testLink(meta,meta.sectionSummaries![0],true)));
});
test('practice URL filters compose by part, type, keyword and folder',()=>{
 const html=render('/practice?part=2&types=true_false&q=birds&source=Forecast');assert.match(html,/Australian birds/);assert.doesNotMatch(html,/Airborne Dentists|Living with robots/);
 assert.doesNotMatch(render('/practice?types=yes_no'),/Australian birds/);
});
test('full tests use one complete test card rather than individual passage cards',()=>{
 const html=render('/full-tests',true);assert.match(html,/Forecast Test 1/);assert.doesNotMatch(html,/Airborne Dentists/);assert.match(html,/3 passages/);
});
test('home statistics come from the catalog and guests do not receive an exam-date account form',()=>{
 const html=renderToStaticMarkup(React.createElement(HomeView,{tests:[meta],profile,attempts:[],onNavigate:()=>{},onUpdateProfile:async()=>{}}));assert.match(html,/Every test is free./);assert.doesNotMatch(html,/type="date"/);
});
test('new routes distinguish homepage, practice, full categories, contribution and section setup',()=>{
 assert.equal(parseRoute('/').name,'home');assert.equal(parseRoute('/practice?part=1').name,'practice');assert.deepEqual(parseRoute('/full-tests/cambridge'),{name:'full',category:'cambridge'});assert.deepEqual(parseRoute('/tests/t/sections/p2'),{name:'test',id:'t',section:'p2'});assert.equal(parseRoute('/admin/content').name,'content-admin');assert.equal(parseRoute('/contribute').name,'practice');assert.equal(parseRoute('/knowledge').name,'practice');
});
test('only manual signed-in submissions with at least half the real question numbers count as attempts',()=>{
 const numbers=Array.from({length:13},(_,i)=>i+14),responses=Object.fromEntries(numbers.slice(0,7).map(n=>[n,'answer']));
 assert.ok(countsAsAttempt('student',true,13,responses,numbers));assert.equal(countsAsAttempt('guest',true,13,responses,numbers),false);assert.equal(countsAsAttempt('student',false,13,responses,numbers),false);assert.equal(countsAsAttempt('student',true,13,{...responses,20:' '},numbers),false);assert.equal(countsAsAttempt('student',true,13,{1:'answer'},numbers),false);
});
test('contribution validation has no premium target and rejects invalid or oversized test payloads',()=>{
 const item={title:'A test',tests:[{parts:[{passageHtml:'<p>Passage</p>',questionHtml:'Questions',questions:[]}]}]};assert.equal(validateContribution(item).title,'A test');assert.throws(()=>validateContribution({...item,tests:[null]}),/incomplete/);assert.throws(()=>validateContribution({...item,tests:[{parts:[{passageHtml:'x'.repeat(710000),questionHtml:'',questions:[]}]}]}),/too large/);
});
test('public answer landing has a crawlable title and a real practice link without exposing keys',()=>{
 const body=solutionBody(meta,[{id:'p0',title:'Airborne Dentists'}]);
 const html=publicPage('Airborne Dentists Reading Answers','Description',body,answerPath('forecast','p0','Airborne Dentists'));
 assert.match(html,/<title>Airborne Dentists Reading Answers/);assert.match(html,/\/tests\/forecast\/sections\/p0/);assert.match(html,/index,follow/);assert.doesNotMatch(html,/Answer: TRUE|Source explanation/);assert.doesNotMatch(textMarkup('<script>alert(1)</script>'),/<script>/);
});

