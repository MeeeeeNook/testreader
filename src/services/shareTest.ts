import {testIntroductionPath} from './testUrls.js';
import {STUDENT_ORIGIN,isAdminHost} from './siteOrigins';
import {setupLink} from './sessionSettings';
import type {EditableTest} from '../types';
export function introductionLink(test:Pick<EditableTest,'id'|'title'|'slug'|'sourceTestId'|'sectionIds'|'sourceSections'>){
 return test.sourceSections?.length?'/mock':test.sourceTestId?(test.slug?testIntroductionPath(test,test.sectionIds?.length===1?test.sectionIds[0]:undefined):setupLink(test.sourceTestId,test.sectionIds?.length===1?test.sectionIds[0]:undefined)):testIntroductionPath(test,test.sectionIds?.length===1?test.sectionIds[0]:undefined);
}
export async function shareTest(path:string,title:string){
 const url=new URL(path,isAdminHost(window.location.hostname)?STUDENT_ORIGIN:window.location.origin).href;
 if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);return 'Link copied';}
 const field=document.createElement('textarea');field.value=url;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();
 try{if(!document.execCommand?.('copy'))throw new Error('Copy this link: '+url);}finally{field.remove();}
 return 'Link copied';
}
