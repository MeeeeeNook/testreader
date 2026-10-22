import { test } from "node:test";
import assert from "node:assert/strict";
import { requestJson } from "../src/services/apiRequest.ts";
import { verifyIdentity } from "../server/identity.ts";
test("submission refreshes an expired ID token once and preserves the original answers", async () => {
  const refreshes: boolean[] = [];
  const requests: RequestInit[] = [];
  const user = {
    uid: "student",
    getIdToken: async (refresh = false) => {
      refreshes.push(refresh);
      return refresh ? "fresh" : "cached";
    },
  };
  const fetcher = (async (_url: any, init: any) => {
    requests.push(init);
    return new Response(
      JSON.stringify(
        requests.length === 1
          ? { error: "expired" }
          : { result: { correct: 1 } },
      ),
      { status: requests.length === 1 ? 401 : 200 },
    );
  }) as typeof fetch;
  const result = await requestJson(
    "/api/submit-exam",
    { responses: { 1: "answer" } },
    () => user,
    fetcher,
  );
  assert.deepEqual(refreshes, [false, true]);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal((requests[1].headers as any).Authorization, "Bearer fresh");
  assert.equal(result.result.correct, 1);
});
test("a second 401 remains visible and never silently downgrades a signed-in student to guest", async () => {
  let calls = 0;
  await assert.rejects(
    requestJson(
      "/api/test-review",
      {},
      () => ({ uid: "a", getIdToken: async () => "token" }),
      (async () => {
        calls++;
        return new Response(JSON.stringify({ error: "Still expired" }), {
          status: 401,
        });
      }) as typeof fetch,
    ),
    /Still expired/,
  );
  assert.equal(calls, 2);
});
test("a server configuration failure is not retried as expired auth", async () => {
  let calls = 0;
  await assert.rejects(
    requestJson("/api/submit-exam", {}, () => null, (async () => {
      calls++;
      return new Response(
        JSON.stringify({ error: "Configure Firebase credentials" }),
        { status: 503 },
      );
    }) as typeof fetch),
    /Configure Firebase credentials/,
  );
  assert.equal(calls, 1);
});
test("switching accounts during a submission does not display the former account result", async () => {
  const user = { uid: "a", getIdToken: async () => "token" };
  let current: any = user;
  await assert.rejects(
    requestJson("/api/submit-exam", {}, () => current, (async () => {
      current = { ...user, uid: "b" };
      return new Response("{}");
    }) as typeof fetch),
    /Account changed/,
  );
});
test("genuine token expiry is a 401, while server credential and networking failures are 503", async () => {
  for (const [code, status] of [
    ["auth/id-token-expired", 401],
    ["app/invalid-credential", 503],
    ["ENOTFOUND", 503],
  ] as const) {
    await assert.rejects(
      verifyIdentity(async () => {
        throw Object.assign(new Error("upstream"), { code });
      }, "token"),
      (error: any) => error.status === status,
    );
  }
});
