import { test } from "node:test";
import assert from "node:assert/strict";
import { createId } from "../src/services/ids.ts";
test("document/session IDs work in preview browsers that have getRandomValues but no randomUUID", () => {
  const source = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  };
  const first = createId(source),
    second = createId(source);
  assert.match(
    first,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.notEqual(first, second);
});
