# Public tests and resource controls

- **Practice / Full Test → a test** opens the practice/exam setup screen. Practice offers 15, 20, 60 minutes or unlimited time. Reading exams use 20 minutes per selected passage, up to 60 minutes.
- **Shared `/reading/...` links** start unlimited practice unless an explicit mode/time was selected. `/solutions/...` remains a public solution guide.
- **Reader toolbar → printer icon** opens PDF/Word export. Default: questions only. Other choices: answer key, or answers plus explanations. Questions-only exports never fetch keys.
- **Submit** shows answers and explanations in place. Signed-in results save quietly through the existing local-first/cloud sync. Guests receive a sign-in notice only for saving results or vocabulary.
- **Admin → Overview → Resource storage** measures test-content estimates and can list uploaded object sizes. Measurements run only on demand. The optional rate calculator is a storage-only estimate before allowances, operations, downloads and taxes; it is not an invoice.
- **Admin → Tests → Edit → Test cover** uploads a compressed WebP cover (up to 1200 × 800) or uses the built-in illustration. Older tests receive illustrations automatically. Upload failure no longer silently embeds a large data URL in Firestore.

## Required server configuration

Public grading/review and bucket inventory require working Firebase Admin credentials. They do not require the learner to sign in. Firestore rules and private answer-key permissions are unchanged.

The Vercel project is `ieltsburger`. Configure the server-only `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel environment variables for the applicable deployments; never use a `VITE_` prefix. The service account must belong to or have access to the Firebase project in `firebase-applet-config.json`, with Cloud Datastore User for its named database and Storage Object Viewer for storage inventory. ADC can be used on hosts that provide it. Redeploy after environment changes.

This task's connector could discover the project but returned HTTP 403 for its environment settings, so production credentials could not be verified or repaired. Local isolated UI tests confirm guest/member behavior with canonical assessment fixtures; they are not evidence of production database access.
