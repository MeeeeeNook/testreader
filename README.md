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
- Both practice and exam submissions use the authenticated server and private keys. Network or configuration errors remain visible and retryable rather than producing a false local score.
- Single-section sessions keep source question numbers. Custom mocks retain canonical source references and are marked with the same sequential mapping shown to the student.
- Practice drafts are scoped to account, test, and mode. Starting a new exam starts with blank responses.
- Unsaved administrator previews use their editable local keys and do not create student attempt records.

`npm test` covers importing, source-feedback removal, control rendering, matching labels, variant marking, multi-select order, missing questions, section selection, and custom mock mappings. Live Firebase access also requires the server configuration above.
