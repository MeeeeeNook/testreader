export interface HomeBlock {id:string;title:string;description:string;href:string;icon:'reading'|'listening'|'full'|'mix';visible:boolean}
export interface WebsiteUI {heroTitle:string;heroDescription:string;showFullTestMenu:boolean;blocks:HomeBlock[]}
export const defaultWebsiteUI:WebsiteUI={heroTitle:'Prepare for IELTS. Practise at your pace.',heroDescription:'Practise reading and listening. Check your answers and review the explanations.',showFullTestMenu:true,blocks:[
 {id:'reading',title:'Reading practice',description:'Explore passages and build your reading skills.',href:'/practice?skill=reading',icon:'reading',visible:true},
 {id:'listening',title:'Listening practice',description:'Choose a part, listen and review your answers.',href:'/practice?skill=listening',icon:'listening',visible:true},
 {id:'full',title:'Full tests',description:'Complete a Reading or Listening test from start to finish.',href:'/full-tests',icon:'full',visible:true},
 {id:'mix',title:'Listening + Reading',description:'Build and share a full test. Complete Listening, then Reading.',href:'/full-exam',icon:'mix',visible:true}
]};
export function normalizeWebsiteUI(input:unknown):WebsiteUI {
 const v=input&&typeof input==='object'?input as Record<string,unknown>:{};
 const text=(x:unknown,fallback:string,max:number)=>typeof x==='string'&&x.trim()?x.trim().slice(0,max):fallback;
 const blocks=Array.isArray(v.blocks)?v.blocks.slice(0,12).map((b:any,i)=>({id:'block-'+i,title:text(b?.title,'Practice',80),description:text(b?.description,'Choose your next test.',200),href:typeof b?.href==='string'&&/^\/(?!\/)[^\s\\]*$/.test(b.href)&&b.href.length<=500?b.href:'/practice',icon:(['reading','listening','full','mix'].includes(b?.icon)?b.icon:'reading') as HomeBlock['icon'],visible:b?.visible!==false})):defaultWebsiteUI.blocks.map(b=>({...b}));
 return {heroTitle:text(v.heroTitle,defaultWebsiteUI.heroTitle,160),heroDescription:text(v.heroDescription,defaultWebsiteUI.heroDescription,400),showFullTestMenu:v.showFullTestMenu!==false,blocks};
}
