import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, writeBatch, doc, terminate } from 'firebase/firestore';
import { buildPrivateKeys } from '../src/services/privateKeys.ts';
import type { EditableTest } from '../src/types.ts';

test('multi-select keys pass the real Firestore serializer without nested arrays', async () => {
  const app = initializeApp({ projectId: 'offline-import-validation' }, 'private-key-test');
  const db = getFirestore(app);
  const test: EditableTest = { schemaVersion: 1, id: 'test_one', title: 'Test', source: 'Forecast', skill: 'reading', access: 'free', status: 'published', duration: 60, createdAt: 1, updatedAt: 1, parts: [{ id: 'p0', title: 'Passage', passageHtml: '', questionHtml: '', slots: { s1: { id: 's1', type: 'multi', numbers: [1, 2], label: 'Choose two', options: [] } }, questions: [{ number: 1, kind: 'multiple_choice_many', answer: 'A', explanationHtml: '<p>First</p>' }, { number: 2, kind: 'multiple_choice_many', answer: 'C' }] }] };
  try {
    const data = buildPrivateKeys(test, 123);
    assert.deepEqual(data.multiGroups, [{ numbers: [1, 2] }]);
    assert.equal(data.keys[1].answer, 'A');
    assert.equal(data.keys[1].explanationHtml, '<p>First</p>');
    assert.equal(data.keys[2].explanationHtml, '');
    assert.throws(() => writeBatch(db).set(doc(db, 'test_keys', test.id), { multiGroups: [[1, 2]] }), /Nested arrays/);
    assert.doesNotThrow(() => writeBatch(db).set(doc(db, 'test_keys', test.id), data));
    // No commit: validation is offline and does not create a real Firebase document.
  } finally { await terminate(db); await deleteApp(app); }
});
