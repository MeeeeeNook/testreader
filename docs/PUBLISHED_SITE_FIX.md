# Published website recovery and UI update

The public domain is https://ielts.vungocmanhcuong.id.vn.

## What changed

The interface is English and light mode only. Old saved language/theme preferences are normalised on load without changing study data or the language of source passages/explanations. Header actions use labelled SVG icons; the account menu closes on Escape and outside clicks. Admin uses a light sidebar, consistent typography, compact controls and selectable folder cards.

Select several folders on Admin → Folders, then choose Delete folders. The confirmation lists root paths and the number of affected tests, including descendants and archived tests. Overlapping folder paths are deduplicated. Deletion uses the existing recoverable Trash flow and retains original publication state for restoration. Folder paths return when tests are restored; attempt records are not deleted.

## Why direct links failed

The previous Vercel build served static Vite output without a deep-link fallback. Opening /admin or following ordinary account/answer links returned Vercel NOT_FOUND before React could load.

vercel.json now routes application pages to index.html, API requests to api/index.ts, and public article/answer-landing routes plus sitemap/robots to Express. The same Express app is exported from server/app.ts and reused by both Vercel and the existing AI Studio server.ts startup. Importing the Vercel handler does not open a listening port or load Vite.

GET /api/health returns JSON identifying the backend. Unknown API paths return JSON 404 instead of frontend HTML. Answer landing pages retain their existing post-submission answer policy.

## Hosting configuration

The repository already has Vercel Git integration for the ieltsburger project. main merges trigger its deployment. No DNS change is required.

If Google sign-in reports auth/unauthorized-domain, add ielts.vungocmanhcuong.id.vn under Firebase Console → Authentication → Settings → Authorized domains. This is distinct from the SPA routing fix.

Firebase Admin needs server credentials on Vercel because AI Studio's runtime credentials are not transferred with source code. If not already configured, set FIREBASE_SERVICE_ACCOUNT_JSON as a sensitive Production environment variable in Vercel for the existing Firebase project. Enter it directly in Vercel; never put it in chat, the repository, or a VITE_ variable. The service account needs the existing database access (Cloud Datastore User). Redeploy after changing environment variables. Do not make Firestore rules public to fix server credentials.

Optionally set PUBLIC_SITE_URL=https://ielts.vungocmanhcuong.id.vn for sitemap absolute URLs.

## Validation

TypeScript, production frontend/server builds and 85 automated tests passed. Tests cover nested folder boundaries and overlap, cancel/confirm deletion, preservation of existing Trash behavior, English rendering for legacy Vietnamese/dark profiles, and the actual serverless entry's health/401/JSON404 responses.

Browser checks on the old public deployment reproduced the direct /admin and /answers/... 404s. Local browser access is unavailable from the browser environment; local HTTP integration tests cover the backend instead. Live owner sign-in, uploads and scoring require the user's authenticated session and correctly configured Firebase runtime.

