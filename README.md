# Reading Studio

## Run

Requires Node.js 22 or later. Install dependencies with `npm install`, then use:

```sh
npm run dev
npm test
npm run lint
npm run build
NODE_ENV=production npm start
```

If you use Bun, run `bun install` to refresh its existing lockfile after dependency changes.

## Firebase server configuration

The browser uses the public project settings in `firebase-applet-config.json`. The Express server uses `firebase-admin` to read private marking keys and verify Firebase sign-in tokens. Configure **Application Default Credentials** for the same project:

- On a Google-managed host, give the server's service account Firestore access in the configured project/database.
- For local development or another host, set `GOOGLE_APPLICATION_CREDENTIALS` to the path of a service-account JSON file stored outside the repository. Never upload that file to the frontend or use a `VITE_` variable for private credentials.
- Deploy the supplied Firestore rules. Student clients should never receive access to `test_keys`.
- `GEMINI_API_KEY` is optional and used only for the dictionary. Importing, answering, and deterministic scoring do not use AI.

References: [Admin SDK setup](https://firebase.google.com/docs/admin/setup), [ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## Repair previously imported tests

The earlier importer stripped original controls, created no replacement slots, and copied feedback into the public question layout. That discarded question structure cannot be reconstructed reliably from its saved output.

After deploying this version, open Admin Studio and upload the original ZIP or HTML files again. Tests with the same content ID and missing controls are repaired in place; their title, source, access, publication status, duration, and creation date are preserved. Healthy duplicates are skipped. Different tests may share a title.

Broken legacy question layouts are hidden until repaired, preventing their embedded solutions from appearing immediately. Questions whose text is absent from the original files stay marked missing and ungradable. No explanation is invented when the source has none.

## Answering and marking

- Text, select, radio, and multiple-choice controls appear at their actual question placeholders, including heading questions in the passage.
- Inputs start blank. Answers and explanations appear only when their respective review toggle is enabled; exam review becomes available after successful submission.
- Both practice and exam submissions use the server (with optional authentication) and private keys. Network or configuration errors remain visible and retryable rather than producing a false local score.
- Single-section sessions keep source question numbers. Custom mocks retain canonical source references and are marked with the same sequential mapping shown to the student.
- Practice and exam drafts are scoped to account and session. Starting a new test creates a blank session; refreshing the current session restores its responses and timer.
- Unsaved administrator previews use their editable local keys and do not create student attempt records.

`npm test` covers importing, source-feedback removal, control rendering, matching labels, variant marking, multi-select order, missing questions, section selection, and custom mock mappings. Live Firebase access also requires the server configuration above.


## Pages and local-first history

The library (`/library`), mock builder (`/mock`), history (`/history`), result review (`/history/:id`), vocabulary, settings, test setup (`/tests/:id`), and active sessions (`/tests/:id/take/:sessionId`) have their own browser URLs. Express serves deep links through its existing SPA fallback. Other hosts must forward these routes to `index.html` while keeping `/api/*` on the Node server.

Only the verified Google account **manhcuong2006ht@gmail.com** can open `/admin` or `/admin/tests/:id`, upload tests, or edit the shared Firebase library. Other accounts and guests can access all published tests. No pricing tiers are shown; new and edited test metadata uses `access: free` for compatibility with older exports.

Completed results are written to versioned, account-scoped local storage before optional Firestore synchronization. Guest results transfer once to the first account that signs in on that browser. Failed cloud uploads remain locally available and retry on reconnect or the history sync button. Stable attempt IDs prevent duplicate records on retry. Full test definitions are not duplicated into each result. Results are personal practice records, not tamper-proof exam certificates.

Active tests use browser confirmation for in-app navigation and Back/Forward within the site, plus the browser's standard beforeunload warning for refresh, closing, or leaving the document. Browsers control the native warning text and require prior interaction. Session drafts and launch details stay on the current device/tab; new sessions start blank. Local storage failures are visible and offer result download.

Deploy **firestore.rules** and the composite indexes in **firestore.indexes.json** to the database named in `firebase-applet-config.json`. These data-service changes are separate from deploying the web app. Existing Firebase credentials and authorized Google sign-in domains are still required. No service-account credentials belong in the browser.

Validation includes deterministic marking/import tests, page rendering, navigation guards, local history migration, account isolation, atomic guest transfer, and cloud retry behavior. Live Google login and Firebase writes need verification in the configured hosting project.

With Firebase CLI authenticated to the existing project, deploy the named database configuration with:

```sh
firebase deploy --only firestore --project gen-lang-client-0464915880
```

`firebase.json` targets the existing named Firestore database; it does not create a different database or hosting site.

## Teacher tools and submission recovery

- **Students** in the sidebar, **Settings → Teacher workspace**, and **Admin Studio → View student attempts** open `/admin/students`. Open a learner to view synced scores and question-by-question answers. Histories load in pages of 30, with older results loaded on demand. Guest/device-only results cannot be viewed by a teacher until the learner signs in and syncs.
- In Admin Studio, select tests to move them to an existing or new collection, publish them, or save them as drafts. Sort by title, collection, recent update, or question count. **Delete** moves content to **Trash**, where it can be restored. No test content is permanently erased by this action.
- Upload ZIP, original True IELTS HTML, or Reading Studio JSON exports through file selection, drag/drop, or folder import. JSON files inside ZIPs are supported. A broken nested archive reports its own error while other entries continue. All file errors remain visible in the import report. Source scripts are never executed.
- The Library button uses an in-page leave dialog, which also works in embedded previews that suppress native `confirm()`. Browser Back/Forward and close/refresh retain their native guards.
- Submission/review refresh an expired Firebase ID token once. Server/database failures report a service/configuration error instead of falsely saying the user's sign-in expired. Results from successful submissions already contain review keys and do not need a second review request.
- A verified owner can use existing protected Firestore reads to mark/review their own tests if the API returns 503. Student and guest marking still require the backend's Firebase credentials. Configure Application Default Credentials on Google hosting, or the server-only `FIREBASE_SERVICE_ACCOUNT_JSON` secret on another host. This does not broaden student access to answer keys.
- Question text, choices, inputs, and passages use the Aa size selector; sessions start at a comfortable 18px minimum.

Browser verification also caught and fixed session-ID generation in preview contexts without `crypto.randomUUID()`. Reset/restart confirmations use visible dialogs; reset is disabled while a submission is in flight.
