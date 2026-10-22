import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleForIdentity } from '../src/services/access.ts';
test('verified owner gets the admin UI without a server role or profile document', () => {
  assert.equal(roleForIdentity({ email: 'manhcuong2006ht@gmail.com', emailVerified: true }), 'admin');
});
test('guests, other accounts, and unverified owner addresses never receive admin navigation', () => {
  assert.equal(roleForIdentity(null), 'student');
  assert.equal(roleForIdentity({ email: 'manhcuong2006ht@gmail.com', emailVerified: false }), 'student');
  assert.equal(roleForIdentity({ email: 'other@gmail.com', emailVerified: true }), 'student');
});
