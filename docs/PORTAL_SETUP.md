# IELTS Studio portal

All published tests are free, including records that still carry a legacy premium flag. There are no payment, unlock or subscription routes. Contributions are voluntary and require administrator review.

## Pages

- `/`: homepage; signed-in learners can set their exam date and see a countdown.
- `/practice`: individual passages/sections. Filters, search and pagination use URL query parameters. Each section has its own `/tests/:id/sections/:sectionId` page.
- `/full-tests`, `/full-tests/forecast`, `/full-tests/vol`, `/full-tests/cambridge`: complete tests. Mix Test stays at `/mock`.
- `/knowledge`: guides filtered by skill and level. Published articles have server-rendered `/knowledge/:id/:slug` pages.
- `/forum`: Coming soon, as requested; no posting workflow is enabled yet.
- `/contribute`: signed-in users submit ZIP, HTML or JSON tests. Pending material is private, never automatically published. Images are embedded during conversion; a contribution is limited to 20 tests and 700 KB of converted content.
- `/admin/content`: create/edit/publish/delete guides. Plain text is supported, with blank lines for paragraphs and `##` for section headings.
- `/admin/contributions`: inspect submitted tests, import suitable material, then accept or reject with feedback.
- `/answers/:testId/:sectionId/:slug`: public, server-rendered answer landing pages; `all` selects the complete test. These pages link into Practice and do not reveal private answer keys. Actual answers and explanations remain in post-submission review until public disclosure is explicitly approved.

The main header appears on ordinary pages and in Practice. Exam mode uses the focused test interface. Back/Forward and internal navigation do not ask for confirmation; in-progress responses continue to autosave locally.

A counted attempt requires a signed-in account, an explicit Submit action, and nonempty responses to at least half the actual question numbers. Automatic expiry and guest submissions still receive a score but do not create history records. Existing previously saved account history is retained. Vocabulary and history pages prompt guests to sign in.

## Deploy through AI Studio

1. Sync the latest GitHub main branch and deploy **both** Express and the Vite build. Run `npm install`, `npm run lint`, `npm test`, `npm run build`, then `npm start` with `NODE_ENV=production`.
2. Keep Firebase project/database configuration and server ADC/service-account IAM from `FIREBASE_RECOVERY.md`. No additional Firestore Rules are required: articles and contributions are accessed via authenticated/server-controlled API routes, and direct client access stays denied by default.
3. Set server environment variable `PUBLIC_SITE_URL` to the final public HTTPS origin (no path). This enables `/sitemap.xml`; `/robots.txt` references it. No secret belongs in this variable.
4. As the verified administrator `manhcuong2006ht@gmail.com`, open Admin Studio and choose **Update passage titles** once for older tests. This also creates lightweight section summaries and question-type metadata needed by Practice filters. New imports receive this metadata automatically.
5. Add real learning guides at `/admin/content`; publish them to make them visible. The site does not invent sample articles or tests.

Google can read the server-rendered answer landing and article pages without executing React. Indexing/ranking is not guaranteed; submit the deployed sitemap in Search Console when the final domain is ready. The sitemap cache lasts one hour to avoid repeatedly scanning the catalog.

Validation covers TypeScript, the production build, navigation, URL filters, history eligibility, administrator-only endpoints, free access to legacy flagged tests, published/draft landing-page separation, and escaped article content. Live Firebase IAM and the AI Studio deployment must still be verified on the hosting account.
