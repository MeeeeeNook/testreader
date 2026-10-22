# Library organization and reader

Folders are records owned by the verified library administrator. The sidebar shows only folders explicitly created with New folder or New subfolder. Existing imported source labels are retained internally as provenance and are never turned into folders. Existing unassigned tests appear in Unfiled.

Create folders under Admin > Folders, including empty folders. Open a folder to see its subfolders and tests. Select tests and choose Move to to relocate them, or choose Unfiled. Folder names and parent folders can be edited without typing paths. Multiple folders can be deleted together. The default keeps tests in Unfiled; an explicit alternative moves their tests to recoverable Trash. Restoring a child folder also restores its ancestors. Folder updates use a version-checked Firestore transaction on the owner's existing profile; no new Firestore rules collection is needed.

Imports are parsed locally before confirmation. Preview has a test list, editable titles, folder/status selection, passage tabs, side-by-side passage and question views, and a separate answer-key inspection table. Every selected test is imported with a fresh UUID regardless of its embedded ID. SHA-256 compares normalized passage, question, slot, answer and explanation content; titles, timestamps and folders do not determine duplicates. Embedded media are hashed by bytes instead of temporary object URLs. A match is advisory and never blocks another copy. Older records without a stored content hash are not classified as duplicates based on their ID.

Tests default to natural title ordering (Test 2 before Test 10); sorting filters remain available. All tests are free. Forum and collections have no active navigation or organization workflow.

The reader follows MeeeeeNook/sample: compact toolbar, previous/next passage selector, timer, dictionary, notes, display settings and print; independently scrolling passage/question panes with a draggable and keyboard-adjustable separator; bottom question navigator; submit confirmation; score summary and per-question answers/explanations with source-location actions. Notes and highlights survive refresh on the device. Answers are not requested on an ordinary test launch. A deliberate solution URL loads the solution guide without creating an attempt.

Public links use /reading/title-token and /solutions/title-token. The stable suffix resolves the underlying test or passage, survives title edits and does not require a session from another device. Existing setup/session links remain supported; legacy answer links enter the solution reader. Sign-in is optional for reading, answering, grading, solutions, dictionary and export; account history retains its existing eligibility rules. Guest session recovery is local and does not create student history.

Print offers PDF and Word. Both are semantic documents, not browser screenshots: centered title, black regular body text, passage(s), questions with empty answer spaces and choices, followed by an answer/explanation table. Missing explanations stay blank. No timing summary or redundant passage-question headings are added. Diagrams are embedded; inaccessible diagrams produce a retryable error instead of silently disappearing. Export libraries load only when requested.

Dictionary uses the documented minhqnd API for English words, including bilingual definitions where available, with cancellation, timeouts, explicit not-found errors, pronunciation audio and optional vocabulary saving. Only the requested word is sent. Attribution links to dict.minhqnd.com and its CC BY-SA 4.0 data license appear in the panel. No source database or code from that project is redistributed.

## Verification

TypeScript, production build and automated tests cover folder CRUD/deletion behavior, reused IDs, advisory content matches, stable media hashes, guest dictionary lookups, repeated-text highlight ranges, public link resolution, submit confirmation, solution-only guest rendering, actual DOCX XML and actual PDF bytes.

Live guest grading, solutions and answer-inclusive exports depend on working Firebase Admin credentials in the deployed API. The API never falls back to exposing private Firestore keys when those credentials are unavailable. Owner operations still require the verified owner account and the existing Firestore rules. Do not place server credentials in VITE variables or paste private keys into chat.
