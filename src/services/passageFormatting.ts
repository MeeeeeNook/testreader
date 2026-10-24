// Some source exports mislabel entire prose paragraphs as headings.
// Repair only documents where several long headings dominate the passage.
export function normalizePassageHeadings(html:string):string{
 if(!/<h[1-6]\b/i.test(html))return html;
 const root=document.createElement('div');root.innerHTML=html;
 const headings=Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'));
 const length=(node:Element)=>node.textContent?.replace(/\s+/g,' ').trim().length||0;
 const prose=headings.filter(h=>length(h)>=180&&(h.textContent||'').trim().split(/\s+/).length>=25);
 const total=length(root),proseLength=prose.reduce((n,h)=>n+length(h),0);
 if(prose.length<3||!total||proseLength/total<.5)return html;
 for(const heading of headings){
  if(length(heading)<100)continue;
  const paragraph=document.createElement('p');
  for(const attribute of Array.from(heading.attributes))paragraph.setAttribute(attribute.name,attribute.value);
  paragraph.style.removeProperty('font-weight');paragraph.style.removeProperty('font-size');
  while(heading.firstChild)paragraph.append(heading.firstChild);
  heading.replaceWith(paragraph);
 }
 return root.innerHTML;
}
