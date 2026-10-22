# AI Studio / Firebase recovery

The upload error and submission error have different causes.

## Importing Forecast folders

Private answer-key multi-select groups now use `[{ numbers: [1, 2] }]`, because Firestore rejects `[[1, 2]]`. Re-import the folder after deploying this change. Existing tests are skipped as duplicates. Failed batches wrote no partial test.

Offline verification against the user's folder: 20 ZIP files and 20 extracted HTML files; 19 distinct test IDs. All 40 converted private-key documents passed the real Firebase SDK serializer without committing writes. The six ZIPs with multi-select questions were previously affected.

## Submit: PERMISSION_DENIED

The Express backend uses Firebase Admin SDK and Application Default Credentials (ADC), unless the server-only FIREBASE_SERVICE_ACCOUNT_JSON is configured. Server access uses Google Cloud IAM; changing Firestore Rules does not fix an Admin SDK permission error.

Current target:
- Project: `gen-lang-client-0464915880`
- Database: `ai-studio-6abc46ea-ea84-43c5-a465-f4d4d4b1e2da`

In Google Cloud Console, identify the actual service account of the deployed Cloud Run revision (service details > Security). In the target Firebase project's IAM page, grant that account Cloud Datastore User (`roles/datastore.user`). Confirm the identity and target before granting access; the logged-in administrator email is not the server identity. If the deployment runs in another project, the grant still belongs in the target Firebase project. Prefer a dedicated runtime account and database-scoped IAM condition where available.

Do not replace Firestore Rules with public read/write rules. Do not put service account JSON into a VITE variable, browser code, GitHub, or a chat message.

Official references:
- https://firebase.google.com/docs/firestore/security/iam
- https://firebase.google.com/docs/firestore/solutions/role-based-access

## Prompt to paste into the AI Studio app chat

Update this app from the latest main branch of MeeeeeNook/testreader, including the Forecast import fix. Preserve existing data.

Fix the deployed Firebase Admin SDK PERMISSION_DENIED error. Use Firebase project gen-lang-client-0464915880 and named database ai-studio-6abc46ea-ea84-43c5-a465-f4d4d4b1e2da. Identify the actual runtime service account; do not guess it or use my login email. Configure ADC and the required Cloud Datastore User IAM access for that account in the target Firebase project. If you cannot change IAM, tell me the exact account email and the exact console steps or command I must run. Do not claim completion before checking database access.

Keep answer keys private. Only verified manhcuong2006ht@gmail.com is administrator. Do not make Firestore Rules public or expose server credentials in frontend variables.

Deploy the Express backend together with the Vite frontend. /api routes must reach Express and return JSON, never index.html. Test /api/health, importing a multi-select ZIP, guest and signed-in submission, answer review after submission, and local history. Verify on the deployed URL. Report any remaining errors separately from Vite hot-reload WebSocket warnings.
