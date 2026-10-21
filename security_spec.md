# Security Specification

## Data Invariants
1. Administrator privileges: Only users documented in `/admins/{adminUid}` have `isAdmin()` privileges. Users cannot write or modify `/admins` documents from the client.
2. User isolation: Students can only read and write their own `/users/{userId}`, `/users/{userId}/attempts/{attemptId}`, and `/users/{userId}/vocabulary/{vocabId}` documents.
3. Account suspension: A user marked with `status: 'suspended'` cannot read or write personal attempts or vocabulary.
4. Public vs Private tests:
   - Published tests in `/tests/{testId}` are readable by authenticated users.
   - Draft and archived tests are only readable by admins.
   - Test sections in `/tests/{testId}/sections/{sectionId}` inherit the parent test's published status or admin check.
5. Answer key privacy: `/test_keys/{testId}` contains master answer keys and is readable/writable ONLY by admins and the trusted backend server. Students have zero read access to `/test_keys`.
6. Content reports: Any authenticated student can submit a report in `/reports/{reportId}` with `owner == request.auth.uid`. Students can read their own reports; admins can read and resolve all reports.
7. Anti-tampering: Students cannot modify their own `status` or `id` fields in `/users/{userId}`.

## Test Payloads & Rules Matrix
- Unauthenticated read of any collection -> DENIED
- Authenticated non-admin attempting read of `/test_keys/{testId}` -> DENIED
- Student attempting to write `/tests/{testId}` -> DENIED
- Student attempting to read another student's `/users/{otherUid}/attempts/{attemptId}` -> DENIED
- Student creating an attempt with `owner != request.auth.uid` -> DENIED
- Student setting `status: 'active'` when suspended -> DENIED
