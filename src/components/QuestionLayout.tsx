import {Select} from "./Select";
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cleanLayout } from '../services/importer';
import { EditablePart, TestSlot } from '../types';

export function AnswerControl({ slot, part, responses, showAnswers, disabled, onChange, onMultiChange }: {
  slot: TestSlot; part: EditablePart; responses: Record<string, string>; showAnswers: boolean; disabled: boolean;
  onChange: (number: number, value: string) => void;
  onMultiChange: (numbers: number[], value: string, checked: boolean) => void;
}) {
  const n = slot.numbers[0];
  const answer = slot.numbers.map(number => part.questions.find(q => q.number === number)?.answer).filter(Boolean).join(' / ');
  const id = `answer-${part.id}-${slot.id}`;
  const badge = showAnswers && answer ? <span className="answer-tag" style={{ display: 'inline-block' }}>Answer: {answer.split('||').join(' / ')}</span> : null;
  if (slot.type === 'text' || slot.type === 'select') {
    return <span className="fill-field" data-q-anchor={n}>
      <label htmlFor={id}>{n}{slot.label ? `. ${slot.label}` : ''}</label>{' '}
      {slot.type === 'text' ? <input id={id} className="fill-input" type="text" autoComplete="off" spellCheck={false}
        aria-label={`Answer for question ${n}`} placeholder="Your answer" disabled={disabled}
        value={responses[n] || ''} onChange={e => onChange(n, e.target.value)} /> :
        <Select id={id} className="question-select" aria-label={`Answer for question ${n}`} disabled={disabled}
          value={responses[n] || ''} onChange={e => onChange(n, e.target.value)}>
          <option value="">Choose…</option>{slot.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>}{badge}
    </span>;
  }
  const selected = slot.numbers.map(number => responses[number]).filter(Boolean);
  return <fieldset className="question-row" data-q-anchor={slot.numbers.join(',')} disabled={disabled}>
    <legend><span className="q-number">{slot.numbers.join('–')}</span>{slot.label || `Choose ${slot.numbers.length} option(s)`}</legend>
    <div className="options">{slot.options.map(o => <label key={o.value} className="option-row">
      <input type={slot.type === 'multi' ? 'checkbox' : 'radio'} name={id} value={o.value}
        checked={slot.type === 'multi' ? selected.includes(o.value) : responses[n] === o.value}
        onChange={e => slot.type === 'multi' ? onMultiChange(slot.numbers, o.value, e.target.checked) : onChange(n, o.value)} />
      <span className="option-letter">{o.value}</span><span>{o.label}</span>
    </label>)}</div>{badge}
  </fieldset>;
}

// React owns the controls; source HTML supplies only sanitized layout placeholders.
export function QuestionLayout({ html, renderSlot }: { html: string; renderSlot: (id: string) => React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const safeHtml = useMemo(() => cleanLayout(html), [html]);
  const [targets, setTargets] = useState<{ id: string; element: HTMLElement }[]>([]);
  useLayoutEffect(() => {
    const placeholders = root.current?.querySelectorAll<HTMLElement>('[data-slot]');
    setTargets(Array.from<HTMLElement>(placeholders || [])
      .map(element => ({ id: element.dataset.slot!, element })));
  }, [safeHtml]);
  return <><div ref={root} dangerouslySetInnerHTML={{ __html: safeHtml }} />
    {targets.map(({ id, element }, i) => createPortal(renderSlot(id), element, `${id}-${i}`))}</>;
}

