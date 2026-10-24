export function humanTestSlug(title){
 return String(title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,180).replace(/-$/,'')||'ielts-test';
}
export function testIntroductionPath(test,sectionId){
 const ref=test.slug||test.id||humanTestSlug(test.title);
 return '/tests/'+encodeURIComponent(ref)+(sectionId?'/sections/'+encodeURIComponent(sectionId):'');
}
export function visibleTestSource(source){const text=String(source||'').trim();return /^(?:test_|[0-9a-f]{8}-[0-9a-f-]{27,})/i.test(text)?'':text;}
