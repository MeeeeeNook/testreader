// Recover titles from older imports whose saved title is only "PASSAGE 1".
export function passageTitle(html: string, saved = '', index = 0): string {
  const useful = (value: string) => {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > 2 && text.length <= 200 &&
      !/^(?:reading\s+)?(?:passage|part|section)\s*(?:\/\s*(?:part|section))?\s*\d*$/i.test(text) &&
      !/^(?:read the|you should spend|questions?\s*\d|answer questions|reading passage)/i.test(text);
  };
  if (useful(saved)) return saved.trim();
  if (typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.innerHTML = html;
    const candidates = container.querySelectorAll('h1,h2,h3,h4,[align="center"],[style*="center"],.title,.passage-title');
    for (const el of candidates) {
      const text = el.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (useful(text)) return text;
    }
  }
  return `Passage ${index + 1}`;
}
