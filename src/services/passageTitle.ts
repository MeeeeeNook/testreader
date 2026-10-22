export const isGenericPassageTitle = (value = '') => !value.trim() || /^(?:(?:ielts|academic|reading|listening)\s+)*(?:passage|part|section)\s*(?:\/\s*(?:part|section))?\s*(?:\d+|[ivx]+)?\s*[:.\-]?$/i.test(value.trim());
export function passageTitle(html: string, saved = '', index = 0): string {
  const useful = (value: string) => {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > 2 && text.length <= 200 && !isGenericPassageTitle(text) &&
      !/^(?:read the|you should spend|questions?\s*\d|answer questions|reading passage|complete the|choose the)/i.test(text);
  };
  if (useful(saved)) return saved.replace(/\s+/g, ' ').trim();
  if (typeof document !== 'undefined') {
    const container = document.createElement('div'); container.innerHTML = html;
    const candidates = container.querySelectorAll('h1,h2,h3,h4,[align="center"],[style*="center"],.title,.passage-title');
    for (const el of candidates) {
      const text = el.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (useful(text)) return text;
    }
    // Some exports put the title in an ordinary paragraph without heading styles.
    for (const el of Array.from(container.querySelectorAll('p,div')).slice(0,8)) {
      if (el.querySelector('p,div,[data-slot],input,select')) continue;
      const text = el.textContent?.replace(/\s+/g,' ').trim() || '';
      if (useful(text) && text.length < 130 && !/[.!?]$/.test(text) && text.split(' ').length < 20) return text;
    }
  }
  return `Passage ${index + 1}`;
}
