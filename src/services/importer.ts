import { passageTitle } from "./passageTitle";
import JSZip from "jszip";
import JSON5 from "json5";

export interface TestSlot {
  id: string;
  numbers: number[];
  type: "text" | "select" | "radio" | "multi";
  label: string;
  options: { value: string; label: string }[];
}

export interface TestQuestion {
  number: number;
  kind: string;
  answer: string;
  explanationHtml?: string;
  referenceQuote?: string;
  missing?: boolean;
}

export interface EditablePart {
  id: string;
  position?: number;
  title: string;
  passageHtml: string;
  questionHtml: string;
  slots: Record<string, TestSlot>;
  questions: TestQuestion[];
  audio?: string;
}

export interface EditableTest {
  schemaVersion: 1;
  id: string;
  title: string;
  skill: "reading" | "listening";
  source: string;
  access: "free" | "premium";
  status: "published" | "draft" | "archived";
  duration: number;
  parts: EditablePart[];
  createdAt: number;
  updatedAt: number;
  authorId?: string;
  sourceTestId?: string;
  sectionIds?: string[];
  sourceSections?: { testId: string; sectionId: string }[];
}

export interface TestMeta {
  id: string;
  title: string;
  skill: "reading" | "listening";
  source: string;
  access: "free" | "premium";
  status: "published" | "draft" | "archived";
  duration: number;
  passages: number;
  passageTitles?: string[];
  sectionSummaries?: {id:string;index:number;title:string;questions:number;kinds:string[]}[];
  questions: number;
  updatedAt: number;
  createdAt?: number;
  custom?: boolean;
  deletedAt?: number | null;
  restoreStatus?: "draft" | "published" | "archived";
}

export interface RawPart {
  topic_content: string;
  question_content: string;
  questions?: number[] | Record<string, number>;
}

export const ALLOWED_TAGS = new Set([
  "P",
  "DIV",
  "SPAN",
  "B",
  "STRONG",
  "EM",
  "I",
  "U",
  "S",
  "SUB",
  "SUP",
  "BR",
  "H1",
  "H2",
  "H3",
  "H4",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TD",
  "TH",
  "BLOCKQUOTE",
  "SECTION",
  "HR",
  "IMG",
]);

const txt = (e: Node | null) =>
  (e?.textContent || "").replace(/\s+/g, " ").trim();
const range = (a: number, b: number) =>
  Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const numberList = (s?: string) => (s?.match(/\d+/g) || []).map(Number);

export function fingerprint(s: string): string {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ s.charCodeAt(i);
  }
  return (a >>> 0).toString(16) + (b >>> 0).toString(16) + "-" + s.length;
}

export function jsonParts(source: string): RawPart[] {
  const m = /(?:\b(?:const|let|var)\s+parts|\bwindow\.parts)\s*=\s*/.exec(
    source,
  );
  if (!m)
    throw new Error(
      "No True IELTS test data found. Choose an original test ZIP or HTML file.",
    );
  const start = m.index + m[0].length;
  let depth = 0;
  let quoted = "";
  let comment = "";
  let escape = false;
  let end = -1;

  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (comment === "line") {
      if (c === "\n") comment = "";
      continue;
    }
    if (comment === "block") {
      if (c === "*" && source[i + 1] === "/") {
        comment = "";
        i++;
      }
      continue;
    }
    if (!quoted && c === "/" && source[i + 1] === "/") {
      comment = "line";
      i++;
      continue;
    }
    if (!quoted && c === "/" && source[i + 1] === "*") {
      comment = "block";
      i++;
      continue;
    }
    if (quoted) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === quoted) quoted = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quoted = c;
      continue;
    }
    if (c === "[" || c === "{") depth++;
    if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end < 0) throw new Error("The saved test data is incomplete.");
  const parts = JSON5.parse(source.slice(start, end));
  if (
    !Array.isArray(parts) ||
    !parts.length ||
    parts.some(
      (p) =>
        typeof p.topic_content !== "string" ||
        typeof p.question_content !== "string",
    )
  ) {
    throw new Error("This file has an unsupported test format.");
  }
  return parts;
}

export function repairQuestions(raw: string): DocumentFragment {
  const recovered: string[] = [];
  const spans: [number, number][] = [];
  const startRe =
    /<div\b[^>]*\bclass\s*=\s*(['"])[^'"]*\bresult-explain\b[^'"]*\1[^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = startRe.exec(raw))) {
    const tags = /<\/?div\b[^>]*>/gi;
    tags.lastIndex = m.index;
    let depth = 0;
    let t: RegExpExecArray | null;
    let end = -1;
    while ((t = tags.exec(raw))) {
      depth += t[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = tags.lastIndex;
        break;
      }
    }
    if (end < 0) break;
    recovered.push(raw.slice(m.index, end));
    spans.push([m.index, end]);
    startRe.lastIndex = end;
  }

  for (const [a, b] of spans.reverse()) {
    raw = raw.slice(0, a) + raw.slice(b);
  }
  // Some exports insert HTML and unescaped apostrophes inside multiline input
  // values. Rebuild those detached source inputs before parsing so a malformed
  // value cannot swallow later choices. The visible .label remains authoritative.
  const attribute = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  raw = raw.replace(
    /<input[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*>/gi,
    (_tag, attributes: string) => {
      const name = /\bname\s*=\s*(['"])(.*?)\1/i.exec(attributes)?.[2] || "";
      const value =
        /\bvalue\s*=\s*(['"])([\s\S]*?)\1(?=[ \t]*(?:\r?\n|$))/i.exec(
          attributes,
        )?.[2] || "";
      const correct = /(?:^|\s)is-value(?:\s|=|$)/i.test(attributes);
      return `<input name="${attribute(name)}" value="${attribute(value)}"${correct ? " is-value" : ""}>`;
    },
  );
  raw = raw.replace(/\sstyle\s*=\s*(['"])([\s\S]*?)\1/gi, (match, q, v) =>
    v.includes("<") ? "" : match,
  );

  const template = document.createElement("template");
  template.innerHTML = raw || "";
  const root = template.content;
  for (const s of recovered) {
    const recTpl = document.createElement("template");
    recTpl.innerHTML = s;
    root.append(recTpl.content);
  }
  return root;
}

export function safeContent(
  root: Node,
  assets: Record<string, string> = {},
): Node {
  function copy(node: Node): Node {
    if (node.nodeType === Node.TEXT_NODE)
      return document.createTextNode(node.nodeValue || "");
    if (
      node.nodeType !== Node.ELEMENT_NODE &&
      node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    ) {
      return document.createDocumentFragment();
    }
    const el = node as HTMLElement;
    if (
      [
        "SCRIPT",
        "STYLE",
        "IFRAME",
        "OBJECT",
        "EMBED",
        "LINK",
        "META",
        "INPUT",
        "SELECT",
        "BUTTON",
        "TEXTAREA",
        "SVG",
        "MATH",
        "FORM",
      ].includes(el.tagName)
    ) {
      return document.createDocumentFragment();
    }
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src") || "";
      const name = src.split(/[?#]/)[0].split("/").at(-1) || "";
      let cached = assets[src] || assets[name];
      if (
        !cached &&
        /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(src) &&
        src.length < 15e6
      ) {
        cached = src;
      }
      if (!cached && /^https:\/\/firebasestorage\.googleapis\.com\//i.test(src))
        cached = src;
      if (!cached) {
        const span = document.createElement("span");
        span.className = "source-image-missing";
        span.textContent = `Diagram not cached (${name || "image file"}).`;
        return span;
      }
      const img = document.createElement("img");
      img.src = cached;
      img.alt = el.getAttribute("alt") || "Reading test diagram";
      return img;
    }

    const supported = ALLOWED_TAGS.has(el.tagName);
    const dest = supported
      ? document.createElement(el.tagName.toLowerCase())
      : document.createDocumentFragment();

    if (supported && ["TD", "TH"].includes(el.tagName)) {
      for (const a of ["colspan", "rowspan"]) {
        const n = Number(el.getAttribute(a));
        if (n > 0 && n < 30) (dest as HTMLElement).setAttribute(a, String(n));
      }
    }
    if (supported && ["P", "H1", "H2", "H3", "H4"].includes(el.tagName)) {
      const align = el.style?.textAlign;
      if (["center", "right"].includes(align))
        (dest as HTMLElement).style.textAlign = align;
      if (/^Questions?\s+\d/i.test(txt(el)))
        (dest as HTMLElement).classList.add("group-heading");
    }

    for (const child of Array.from(node.childNodes)) {
      dest.appendChild(copy(child));
    }
    return dest;
  }
  return copy(root);
}

export function cleanLayout(raw: string): string {
  const template = document.createElement("template");
  template.innerHTML = raw || "";
  const root = template.content;
  root
    .querySelectorAll(
      ".result-explain,.true-answer,.collapse-explain,.btn-explain-group",
    )
    .forEach((e) => e.remove());
  const placeholders: { token: string; id: string }[] = [];

  const slots = Array.from(root.querySelectorAll("[data-slot]"));
  for (const [i, e] of slots.entries()) {
    const id = (e as HTMLElement).dataset.slot || "";
    const token = `IELTSSLOT${i}END`;
    placeholders.push({ token, id });
    e.replaceWith(document.createTextNode(token));
  }

  const container = document.createElement("div");
  container.append(safeContent(root));
  let html = container.innerHTML;
  for (const p of placeholders) {
    html = html.replace(
      p.token,
      `<span data-slot="${p.id.replace(/[^a-zA-Z0-9_-]/g, "")}"></span>`,
    );
  }
  return html;
}

export function extractTitle(source: string, fallback: string): string {
  const m =
    /<[^>]+class\s*=\s*(['"])[^'"]*\bheader-title\b[^'"]*\1[^>]*>([\s\S]*?)<\/[^>]+>/i.exec(
      source,
    );
  if (m) {
    const tpl = document.createElement("template");
    tpl.innerHTML = m[2];
    return txt(tpl.content).replace(/_/g, " ");
  }
  return fallback.replace(/\.(html?|zip)$/i, "");
}

export function toEditable(
  data: { title?: string; parts: RawPart[] },
  meta: Partial<EditableTest> = {},
  assets: Record<string, string> = {},
): EditableTest {
  const rawParts = data.parts;
  const parts: EditablePart[] = [];
  const testId = meta.id || fingerprint(JSON.stringify(rawParts));

  rawParts.forEach((part, partIndex) => {
    const tplTopic = document.createElement("template");
    tplTopic.innerHTML = part.topic_content;
    const topic = tplTopic.content;
    const q = repairQuestions(part.question_content);

    const rawNums = part.questions || [];
    const declared = (Array.isArray(rawNums) ? rawNums : Object.values(rawNums))
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const timing = /Questions?\s+(\d+)\s*[–—-]\s*(\d+)/i.exec(txt(topic));
    const expected =
      Array.isArray(rawNums) && declared.length >= 10
        ? declared
        : timing
          ? range(+timing[1], +timing[2])
          : declared;

    const keys = new Map<
      number,
      { answer: string; kind?: string; explanation?: Node | null }
    >();
    expected.forEach((n) => keys.set(n, { answer: "", explanation: null }));

    const mapping = new Map<string, number>();
    const assigned = new Set<number>();
    const headings: { n: number; letter: string }[] = [];
    const widgets: { w: HTMLElement; type: string; nums: number[] }[] = [];
    const multiGroups: number[][] = [];
    const groups = new Map<HTMLElement, number>();
    const seenWidgets = new Set<string>();

    const ensure = (n: number) => {
      if (!keys.has(n)) keys.set(n, { answer: "", explanation: null });
    };

    const seenHeadings = new Set<string>();
    Array.from(topic.querySelectorAll(".question")).forEach((w) => {
      const n = Number(w.getAttribute("question-number"));
      if (!Number.isFinite(n) || !n) return;
      ensure(n);
      mapping.set(String(n), n);
      const inputs = Array.from(
        w.querySelectorAll("input"),
      ) as HTMLInputElement[];
      const k = n + "|" + inputs.map((e) => e.name).join();
      if (seenHeadings.has(k)) {
        w.remove();
        return;
      }
      seenHeadings.add(k);
      const letter = String.fromCharCode(65 + headings.length);
      headings.push({ n, letter });
      assigned.add(n);
      const el = document.createElement("div");
      el.className = "heading-question";
      el.dataset.qAnchor = String(n);
      const str = document.createElement("strong");
      str.textContent = "Paragraph " + letter + " ";
      el.appendChild(str);
      const group = w.getAttribute("group-number") || "";
      el.dataset.headingGroup = group;
      w.replaceWith(el);
    });

    let current = expected[0] || 1;
    Array.from(q.querySelectorAll("*")).forEach((e) => {
      if (["P", "H1", "H2", "H3", "H4"].includes(e.tagName)) {
        const m = /^Questions?\s+(\d+)/i.exec(txt(e));
        if (m) current = +m[1];
      }
      if (e.classList.contains("question"))
        groups.set(e as HTMLElement, current);
    });

    let cursor = expected[0] || 1;
    while (assigned.has(cursor)) cursor++;
    Array.from(q.querySelectorAll(".question")).forEach((wEl) => {
      const w = wEl as HTMLElement;
      const type = [
        "true_false",
        "yes_no",
        "fill_blank",
        "matching_features",
        "multiple_choice_one",
        "multiple_choice_many",
        "matching_names",
      ].find((c) => w.classList.contains(c));
      if (!type) return;

      const inputs = Array.from(
        w.querySelectorAll("input"),
      ) as HTMLInputElement[];
      const sig = [
        type,
        w.getAttribute("question-number"),
        inputs.map((x) => x.name).join(","),
        txt(w),
      ].join("|");
      if (seenWidgets.has(sig)) {
        w.remove();
        return;
      }
      seenWidgets.add(sig);

      let nums: number[] = [];
      if (type === "matching_names") {
        const items = Array.from(
          w.querySelectorAll(".item-question"),
        ) as HTMLElement[];
        let start = groups.get(w) || cursor;
        if (
          assigned.has(start) ||
          (start < cursor && expected.includes(cursor))
        )
          start = cursor;
        nums = range(start, start + items.length - 1);
        items.forEach((e, i) => {
          mapping.set("id:" + e.id.replace(/^question-/, ""), nums[i]);
          e.dataset.assigned = String(nums[i]);
        });
      } else if (type === "multiple_choice_many") {
        const fs = Array.from(w.querySelectorAll(".true-answer"));
        const count =
          fs.length || w.querySelectorAll("input[is-value]").length || 2;
        let start = groups.get(w) || cursor;
        if (assigned.has(start)) start = cursor;
        nums = range(start, start + count - 1);
        fs.forEach((e, i) => {
          const key = e
            .querySelector(".btn-explain")
            ?.getAttribute("data-number");
          if (key) mapping.set(key, nums[i]);
        });
      } else {
        const old =
          w.getAttribute("question-number") ||
          txt(w.querySelector(".number")) ||
          String(cursor);
        const n = +old;
        if (!Number.isInteger(n) || n < 1)
          throw new Error("A question number could not be read.");
        nums = [n];
        mapping.set(old, n);
      }

      nums.forEach((n) => {
        ensure(n);
        assigned.add(n);
      });
      cursor = Math.max(...nums) + 1;
      while (assigned.has(cursor)) cursor++;
      widgets.push({ w, type, nums });

      if (type === "true_false" || type === "yes_no") {
        const correct = w.querySelector(
          "input[is-value]",
        ) as HTMLInputElement | null;
        if (correct)
          keys.get(nums[0])!.answer = (correct.value || "")
            .replace(/_/g, " ")
            .toUpperCase();
      }
      if (type === "multiple_choice_one") {
        const correct = w.querySelector("input[is-value]");
        if (correct?.parentElement) {
          keys.get(nums[0])!.answer = txt(
            correct.parentElement.querySelector(".number-alphabet"),
          );
        }
      }
      if (type === "multiple_choice_many") {
        const forms = Array.from(w.querySelectorAll(".form-check"));
        const correct = forms
          .filter((o) => o.querySelector("input[is-value]"))
          .map((o) => txt(o.querySelector(".number-alphabet")));
        nums.forEach((n, i) => {
          if (correct[i]) keys.get(n)!.answer = correct[i];
        });
      }
    });

    const resolve = (key?: string | null): number | null => {
      if (!key) return null;
      if (mapping.has(key)) return mapping.get(key)!;
      const bits = key.split("-");
      if (bits.length > 1 && mapping.has("id:" + bits.at(-1)))
        return mapping.get("id:" + bits.at(-1))!;
      return /^\d+$/.test(key) ? +key : null;
    };

    Array.from(q.querySelectorAll(".true-answer")).forEach((f) => {
      const key =
        f.querySelector(".btn-explain")?.getAttribute("data-number") ||
        (f.nextElementSibling?.classList.contains("collapse-explain")
          ? f.nextElementSibling.id.replace(/^collapse-explain-/, "")
          : null);
      const n = resolve(key);
      const a = f.querySelector(".answer");
      if (n !== null && a) {
        ensure(n);
        const v = txt(a).replace(/^Answer\s*:\s*/i, "");
        if (v) keys.get(n)!.answer = v;
      }
    });

    Array.from(q.querySelectorAll(".collapse-explain")).forEach((exp) => {
      const n = resolve(exp.id.replace(/^collapse-explain-/, ""));
      if (n !== null) {
        ensure(n);
        if (txt(exp) || exp.querySelector("img"))
          keys.get(n)!.explanation = exp.cloneNode(true);
      }
    });

    const banks = Array.from(q.querySelectorAll(".answer"))
      .filter((e) => e.querySelector(".answer-item"))
      .map((el) => {
        const heading = el.classList.contains("matching_info");
        return {
          el,
          heading,
          nums: numberList(el.id),
          options: Array.from(el.querySelectorAll(".answer-item")).map(
            (o, i) => ({
              label: txt(o),
              value: heading
                ? txt(o).split(/\s/)[0].replace(/[.)]$/, "")
                : String.fromCharCode(65 + i),
            }),
          ),
        };
      });

    for (const bank of banks) {
      if (!bank.heading) {
        for (const n of bank.nums) {
          const k = keys.get(n);
          if (k) {
            const o = bank.options.find((opt) => opt.label === k.answer);
            if (o) k.answer = o.value + " · " + o.label;
          }
        }
      }
    }

    const slots: Record<string, TestSlot> = {};
    const missing = new Set<number>();
    function slot(
      numbers: number[],
      type: TestSlot["type"],
      label = "",
      options: TestSlot["options"] = [],
    ) {
      const id = "s" + Object.keys(slots).length;
      slots[id] = { id, numbers, type, label, options };
      const el = document.createElement("span");
      el.dataset.slot = id;
      return el;
    }
    for (const { w, type, nums } of widgets) {
      nums.forEach((n) => {
        keys.get(n)!.kind = type;
      });
      const n = nums[0];
      if (type === "true_false" || type === "yes_no") {
        const options = (
          type === "true_false"
            ? ["TRUE", "FALSE", "NOT GIVEN"]
            : ["YES", "NO", "NOT GIVEN"]
        ).map((value) => ({ value, label: value }));
        w.replaceWith(
          slot(nums, "select", txt(w.querySelector(".name")), options),
        );
      } else if (type === "fill_blank") {
        w.replaceWith(slot(nums, "text"));
      } else if (type === "matching_features") {
        const bank = banks.find((b) => b.nums.includes(n));
        w.replaceWith(
          slot(
            nums,
            bank ? "select" : "text",
            "",
            bank?.options.map((o) => ({
              value: o.value,
              label: o.value + " - " + o.label,
            })) || [],
          ),
        );
      } else if (
        type === "multiple_choice_one" ||
        type === "multiple_choice_many"
      ) {
        const options = Array.from(w.querySelectorAll(".form-check"))
          .map((opt) => {
            const input = opt.querySelector("input");
            const value = txt(opt.querySelector(".number-alphabet")).replace(
              /[.)]$/,
              "",
            );
            return {
              value,
              label: txt(opt.querySelector(".label")) || input?.value || "",
            };
          })
          .filter((o) => o.value);
        w.replaceWith(
          slot(
            nums,
            type === "multiple_choice_many" ? "multi" : "radio",
            txt(w.querySelector(".name")),
            options,
          ),
        );
      } else if (type === "matching_names") {
        const block = document.createElement("div");
        const letters = Array.from(w.querySelectorAll(".number-alphabet")).map(
          txt,
        );
        for (const item of Array.from(w.querySelectorAll(".item-question"))) {
          const num = Number((item as HTMLElement).dataset.assigned);
          const label = item.querySelector(".label")?.cloneNode(true) as
            HTMLElement | undefined;
          label?.querySelectorAll(".number").forEach((e) => e.remove());
          const inputs = Array.from(item.querySelectorAll("input"));
          const options = (
            letters.length ? letters : inputs.map((e) => e.value)
          ).map((value) => ({ value, label: value }));
          const key = keys.get(num)!;
          const index = inputs.findIndex((e) => e.value === key.answer);
          if (index >= 0 && letters[index] && key.answer !== letters[index])
            key.answer = letters[index] + " · " + key.answer;
          block.append(slot([num], "select", txt(label || null), options));
        }
        w.replaceWith(block);
      }
    }
    // Feedback is private data, never part of the public question layout.
    for (const root of [topic, q]) {
      root
        .querySelectorAll(
          ".result-explain,.true-answer,.collapse-explain,.btn-explain-group",
        )
        .forEach((e) => e.remove());
    }
    const headingOptions = new Map<number, TestSlot["options"]>();
    for (const bank of banks) {
      if (!bank.el.parentNode) continue;
      const box = document.createElement("div");
      for (const option of bank.options) {
        const row = document.createElement("div");
        row.textContent = bank.heading
          ? option.label
          : option.value + "  " + option.label;
        box.append(row);
      }
      if (bank.heading) {
        for (const h of headings.filter((h) => bank.nums.includes(h.n)))
          headingOptions.set(h.n, bank.options);
      }
      bank.el.replaceWith(box);
    }
    for (const h of headings) {
      const node = Array.from(topic.querySelectorAll("[data-q-anchor]")).find(
        (e) => (e as HTMLElement).dataset.qAnchor === String(h.n),
      );
      const options = headingOptions.get(h.n) || [];
      keys.get(h.n)!.kind = "heading";
      node?.append(
        slot([h.n], options.length ? "select" : "text", "", options),
      );
    }
    function substitute(root: DocumentFragment) {
      // Walk recursively instead of interpreting or executing source scripts.
      const nodes: Text[] = [];
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) nodes.push(node as Text);
        else Array.from(node.childNodes).forEach(walk);
      };
      walk(root);
      for (const node of nodes) {
        if (!/\{(?:CAU|DAP_AN)_/.test(node.data)) continue;
        const fragment = document.createDocumentFragment();
        const re = /\{CAU_([\d_]+)\}|\{DAP_AN_[\d_]+\}/g;
        let last = 0,
          match: RegExpExecArray | null;
        while ((match = re.exec(node.data))) {
          fragment.append(
            document.createTextNode(node.data.slice(last, match.index)),
          );
          if (match[1]) {
            const nums = match[1].split("_").map(Number);
            for (const n of nums) {
              ensure(n);
              if (assigned.has(n))
                fragment.append(document.createTextNode(` (${n}) `));
              else if (nums.length === 1) {
                assigned.add(n);
                fragment.append(slot([n], "text"));
              } else missing.add(n); // A range placeholder contains no recoverable question text.
            }
          }
          last = re.lastIndex;
        }
        fragment.append(document.createTextNode(node.data.slice(last)));
        node.replaceWith(fragment);
      }
    }
    substitute(topic);
    substitute(q);
    Array.from(keys.keys())
      .filter((n) => !assigned.has(n))
      .forEach((n) => missing.add(n));
    for (const n of missing) {
      const notice = document.createElement("p");
      notice.textContent =
        n + ". Question text is missing from the saved file.";
      q.append(notice);
    }
    const questions: TestQuestion[] = Array.from(keys.entries())
      .map(([n, k]) => {
        const container = document.createElement("div");
        if (k.explanation) container.append(safeContent(k.explanation, assets));
        return {
          number: n,
          kind: k.kind || "fill_blank",
          answer: k.answer || "",
          explanationHtml: container.innerHTML,
          referenceQuote: "",
          missing: missing.has(n),
        };
      })
      .sort((a, b) => a.number - b.number);
    function layout(root: DocumentFragment): string {
      // Keep only our typed placeholders through the HTML allowlist.
      const placeholders = Array.from(root.querySelectorAll("[data-slot]")).map(
        (e, i) => {
          const id = (e as HTMLElement).dataset.slot!;
          const token = "IELTSSLOT" + i + "END";
          e.replaceWith(document.createTextNode(token));
          return { id, token };
        },
      );
      const el = document.createElement("div");
      el.append(safeContent(root, assets));
      let html = el.innerHTML;
      for (const { id, token } of placeholders)
        html = html.replace(token, '<span data-slot="' + id + '"></span>');
      return html;
    }
    const passageHtml = layout(topic);
    const title = passageTitle(part.topic_content, "", partIndex);
    const questionHtml = layout(q);

    parts.push({
      id: `p${partIndex}`,
      position: Number(/(?:PASSAGE|SECTION|PART)\s*([1-4])\b/i.exec(part.topic_content.replace(/<[^>]*>/g," "))?.[1]) || partIndex + 1,
      title,
      passageHtml,
      questionHtml,
      slots,
      questions,
      audio: "",
    });
  });

  return {
    schemaVersion: 1,
    id: testId,
    title: parts.length === 1 && parts[0].title !== "Passage 1" ? parts[0].title : data.title || meta.title || "Untitled IELTS Test",
    skill: meta.skill || "reading",
    source: meta.source || "Imported Collection",
    access: meta.access || "free",
    status: meta.status || "published",
    duration: rawParts.length === 1 ? 20 : 60,
    parts,
    createdAt: meta.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

export async function collectFiles(
  files: File[],
): Promise<{
  candidates: { source: string; name: string }[];
  images: { name: string; url: string; blob: Blob }[];
  errors: string[];
}> {
  const candidates: { source: string; name: string }[] = [];
  const images: { name: string; url: string; blob: Blob }[] = [];
  const errors: string[] = [];
  let totalSize = 0;

  async function processZip(
    data: ArrayBuffer | Uint8Array,
    name: string,
    depth = 0,
  ) {
    if (depth > 3) throw new Error("Too many nested ZIP levels.");
    const zip = await JSZip.loadAsync(data);
    const entries = Object.values(zip.files).filter((e) => !e.dir);
    if (entries.length > 2500) throw new Error("This ZIP has too many files.");

    for (const entry of entries) {
      const lower = entry.name.toLowerCase();
      if (
        entry.name.startsWith("__MACOSX/") ||
        entry.name.split("/").at(-1)?.startsWith("._")
      )
        continue;
      try {
        if (/\.(html?|json)$/.test(lower)) {
          const s = await entry.async("string");
          totalSize += s.length;
          if (totalSize > 180e6)
            throw new Error(
              "Import is too large. Add test ZIPs in smaller groups.",
            );
          candidates.push({ source: s, name: name + "/" + entry.name });
        } else if (/\.zip$/.test(lower)) {
          await processZip(
            await entry.async("uint8array"),
            name + "/" + entry.name,
            depth + 1,
          );
        } else if (/\.(png|jpe?g|webp|gif)$/i.test(lower)) {
          const blob = await entry.async("blob");
          images.push({
            name: entry.name.split("/").at(-1) || entry.name,
            url: URL.createObjectURL(blob),
            blob,
          });
        }
      } catch (error) {
        errors.push(
          `${name}/${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  for (const f of files) {
    try {
      if (f.size > 150e6)
        throw new Error(
          `${f.name} is too large. Import individual test ZIPs instead.`,
        );
      if (/\.zip$/i.test(f.name)) {
        await processZip(await f.arrayBuffer(), f.name);
      } else if (/\.html?$/i.test(f.name)) {
        candidates.push({
          source: await f.text(),
          name: f.webkitRelativePath || f.name,
        });
      } else if (f.type.startsWith("image/")) {
        images.push({
          name: f.name,
          url: URL.createObjectURL(f),
          blob: f,
        });
      } else if (/\.json$/i.test(f.name)) {
        // Handled directly by caller
      } else {
        errors.push(`${f.name}: choose an original ZIP or HTML file.`);
      }
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { candidates, images, errors };
}

// Supported JSON imports are validated before any Firebase write. No source scripts execute.
export function importJsonTests(
  source: string,
  filename: string,
  assets: Record<string, string> = {},
): EditableTest[] {
  const data = JSON5.parse(source.replace(/^\uFEFF/, ""));
  const items =
    Array.isArray(data) && data[0]?.topic_content !== undefined
      ? [{ parts: data }]
      : Array.isArray(data)
        ? data
        : data?.format === "ielts-studio-backup"
          ? data.tests
          : [data];
  if (!Array.isArray(items) || !items.length)
    throw new Error("The JSON file contains no tests.");
  return items.map((item: any) => {
    if (!item || !Array.isArray(item.parts) || !item.parts.length)
      throw new Error("Expected a test with a non-empty parts array.");
    if (typeof item.parts[0].topic_content === "string")
      return toEditable(
        item,
        {
          title: item.title || filename,
          source: item.source || "Imported collection",
        },
        assets,
      );
    if (
      item.parts.some(
        (part: any) =>
          typeof part.passageHtml !== "string" ||
          typeof part.questionHtml !== "string" ||
          !Array.isArray(part.questions),
      )
    )
      throw new Error(
        "A test section is missing passageHtml, questionHtml, or questions. Upload the original True IELTS HTML or a Reading Studio JSON export.",
      );
    return {
      ...item,
      schemaVersion: 1,
      id:
        typeof item.id === "string" && /^[\w-]{1,128}$/.test(item.id)
          ? item.id
          : "test_" + fingerprint(JSON.stringify(item.parts)),
      title: (item.title || filename).slice(0, 250),
      source: item.source || "Imported collection",
      skill: item.skill === "listening" ? "listening" : "reading",
      access: "free",
      status: ["published", "draft", "archived"].includes(item.status)
        ? item.status
        : "published",
      duration:
        Number(item.duration) > 0
          ? Number(item.duration)
          : item.parts.length === 1
            ? 20
            : 60,
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Date.now(),
      parts: item.parts.map((part: any, index: number) => ({
        ...part,
        id: part.id || "p" + index,
        title: passageTitle(part.passageHtml, part.title, index),
        slots: part.slots || {},
        audio: part.audio || "",
        questions: part.questions.map((q: any) => ({
          ...q,
          answer: typeof q.answer === "string" ? q.answer : "",
          kind: q.kind || "fill_blank",
        })),
      })),
    } as EditableTest;
  });
}
