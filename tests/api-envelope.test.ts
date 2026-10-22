import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestJson } from '../src/services/apiRequest.ts';
test('a host returning frontend HTML for the scoring route produces an identifiable 502', async () => {
  await assert.rejects(requestJson('/api/submit-exam', {}, () => null, (async () => new Response('<!doctype html><html>Frontend</html>', {status: 200})) as typeof fetch), (error: any) => error.status === 502 && /API.*JSON/.test(error.message));
});
test('permission failures retain their server status and useful administrator instructions', async () => {
  await assert.rejects(requestJson('/api/submit-exam', {}, () => null, (async () => new Response(JSON.stringify({error:'Grant the runtime service account database access'}),{status:503})) as typeof fetch), (error: any) => error.status === 503 && /runtime service account/.test(error.message));
});
