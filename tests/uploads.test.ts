import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import JSZip from "jszip";
import {
  jsonParts,
  importJsonTests,
  collectFiles,
} from "../src/services/importer.ts";
const { window } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { document: window.document, Node: window.Node });
test("original exports can use single quotes, unquoted keys, trailing commas, and comments", () => {
  const parts = jsonParts(
    `window.parts = [{topic_content: '<p>A ] bracket</p>', /* } ignored */ question_content: '<p>A question</p>',},];`,
  );
  assert.equal(parts.length, 1);
  assert.match(parts[0].topic_content, /bracket/);
});
test("import parser rejects executable expressions and never evaluates source scripts", () => {
  assert.throws(() =>
    jsonParts(
      `const parts = [{ topic_content: window.attack(), question_content: ''}];`,
    ),
  );
});
test("JSON imports accept a raw passage array and native exports without an ID", () => {
  const raw = importJsonTests(
    JSON.stringify([
      { topic_content: "<h2>Passage</h2>", question_content: "<p>{CAU_1}</p>" },
    ]),
    "raw.json",
  );
  assert.equal(raw.length, 1);
  assert.equal(raw[0].parts.length, 1);
  const native = importJsonTests(
    JSON.stringify({
      title: "Native test",
      parts: [
        {
          passageHtml: "<p>Passage</p>",
          questionHtml: "<p>Question</p>",
          questions: [],
        },
      ],
    }),
    "native.json",
  );
  assert.match(native[0].id, /^test_/);
  assert.equal(native[0].status, "published");
  assert.equal(native[0].parts[0].id, "p0");
});
test("bad JSON records fail before reaching Firebase with a useful format error", () => {
  assert.throws(
    () => importJsonTests("{parts:[{}]}", "broken.json"),
    /passageHtml/,
  );
  assert.throws(() => importJsonTests("{}", "broken.json"), /non-empty parts/);
});
test("a corrupt nested ZIP does not discard healthy HTML and JSON tests in the same archive", async () => {
  const archive = new JSZip();
  archive.file("broken.zip", "not a ZIP");
  archive.file("good/test.html", "const parts=[];");
  archive.file("backup.json", '{"tests":[]}');
  const file = new File(
    [(await archive.generateAsync({ type: "uint8array" })) as any],
    "collection.zip",
  );
  const result = await collectFiles([file]);
  assert.equal(result.candidates.length, 2);
  assert.ok(result.errors.some((e) => e.includes("broken.zip")));
  assert.ok(result.candidates.some((c) => c.name.endsWith("backup.json")));
});
