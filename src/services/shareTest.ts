import {setupLink} from './sessionSettings';
import type {EditableTest} from '../types';
export function introductionLink(test:Pick<EditableTest,'id'|'sourceTestId'|'sectionIds'|'sourceSections'>){
 return test.sourceSections?.length?'/mock':setupLink(test.sourceTestId||test.id,test.sectionIds?.length===1?test.sectionIds[0]:undefined);
}
export async function shareTest(path:string,title:string){
 const url=new URL(path,window.location.origin).href;
 if(navigator.share){try{await navigator.share({title,url});return 'Shared'}catch(e){if((e as Error).name==='AbortError')return '';}}
 if(!navigator.clipboard?.writeText)throw new Error('Copy this link: '+url);
 await navigator.clipboard.writeText(url);return 'Link copied';
}
