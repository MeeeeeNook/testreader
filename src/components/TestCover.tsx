import React, { useState } from 'react';

// Every test has a lightweight illustration, including older imports with no cover.
export function TestCover({ id, title, image,skill='reading' }: { id: string; title: string; image?: string;skill?:'reading'|'listening' }) {
  const [failed, setFailed] = useState('');
  const seed = Array.from(id).reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7);
  const palettes = [['#d8eff0','#70b7b7','#23757e'],['#f7e9cf','#e1b066','#9b692f'],['#e6e1f4','#a49bd1','#625391'],['#dfeede','#91b789','#477447'],['#dfeaf8','#8cadde','#446caa']];
  const [sky, hill, ink] = palettes[seed % palettes.length];
  return image && failed !== image ? <img className="test-cover-image" src={image} alt={title} loading="lazy" onError={() => setFailed(image)} /> :
    <svg className="test-cover-image" role="img" aria-label={`Illustrated cover for ${title}`} viewBox="0 0 480 240" preserveAspectRatio="xMidYMid slice">
      <rect width="480" height="240" fill={sky}/><circle cx={330 + seed % 70} cy="62" r="34" fill="#fff" opacity=".65"/>
      <path d={`M0 190 Q100 ${90 + seed % 50} 245 180 T480 155 V240 H0Z`} fill={hill}/><path d="M0 225 Q145 148 300 208 T480 185 V240 H0Z" fill={ink} opacity=".3"/>
      {skill==='listening'?<g stroke={ink} strokeWidth="10" fill="none" strokeLinecap="round"><path d="M173 134v-24a67 67 0 0 1 134 0v24"/><rect x="163" y="113" width="28" height="65" rx="12" fill="#fffdf6"/><rect x="289" y="113" width="28" height="65" rx="12" fill="#fffdf6"/><path d="M215 114v35m17-51v65m17-57v51m17-35v18" strokeWidth="6"/></g>:<g transform={`translate(${135 + seed % 80} 58) rotate(${seed % 13 - 6} 65 65)`} stroke={ink} strokeWidth="4" strokeLinejoin="round">
        <path d="M0 12 Q40 -2 68 16 Q99 0 136 12 V121 Q100 108 68 128 Q35 110 0 121Z" fill="#fffdf6"/>
        <path d="M68 16V128M15 35Q38 28 53 38M15 53Q38 46 53 56M15 71Q38 64 53 74M83 35H119M83 53H119M83 71H110" fill="none" opacity=".7"/>
      </g>}
    </svg>;
}
