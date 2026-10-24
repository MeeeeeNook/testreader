import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rulesAttachmentPoint,securityTestSuite} from '../scripts/firestore-security.mjs';
test('named database rules attach to a fully qualified numeric project resource',()=>{
 assert.equal(rulesAttachmentPoint({messagingSenderId:'310644168805',firestoreDatabaseId:'named'}),'firestore.googleapis.com/projects/310644168805/databases/named');
 assert.equal(rulesAttachmentPoint({appId:'1:12345:web:example'}),'firestore.googleapis.com/projects/12345/databases/(default)');
 assert.throws(()=>rulesAttachmentPoint({messagingSenderId:'project-slug'}),/PROJECT_NUMBER_MISSING/);
});
test('Firebase evaluation requests target the configured database and include allow and deny cases',()=>{
 const suite=securityTestSuite('named');assert.equal(suite.testCases.length,33);
 assert.ok(suite.testCases.every((item:any)=>item.request.path.startsWith('/databases/named/documents/')));
 assert.ok(suite.testCases.some((item:any)=>item.expectation==='ALLOW'));assert.ok(suite.testCases.some((item:any)=>item.expectation==='DENY'));
});
