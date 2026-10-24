# Shared library and full Listening + Reading tests

## Upload and folders

The import preview always shows the destination folder above the test content. Changing this folder assigns every selected test; individual overrides remain available under Test settings. Listening questions fill the content pane by default, with an optional transcript toggle and separate audio tab.

If the selected upload skill differs from detected content, the preview asks to switch skills. It reuses the parsed ZIP contents and audio without another upload or unpack. A mixed batch can keep the current skill or switch to the other skill; it never reclassifies the test itself.

Folders are shared by Reading and Listening. Legacy copies with the same full path are consolidated in the catalog, and old folder IDs remain as aliases so shared links work. The next normal folder save persists the consolidated registry and updates test organization metadata; passages, questions, audio and answer keys are unchanged. Public collection pages default to both skills and offer Reading/Listening filters.

## Listening

The volume slider defaults to 80%, representing the original recording level. At 100%, a Web Audio gain node applies 1.25× gain. Browsers without Web Audio fall back to native volume without amplification. No audio is re-encoded for this change.

Listening Word/PDF exports group all questions first, followed by the selected answer key, explanations and transcript. Each following group starts on a new page. Each group can still be excluded in the download dialog.

Listening defaults to a headphone illustration. Test editor → Test cover accepts a custom image, resizes it, compresses it to WebP and uses the existing configured R2 media upload path.

## Vocabulary

Personal folders are stored on each student's own profile. Words store a folder ID in that student's private vocabulary collection. Older words and saves without an active folder use **Từ mới**. The notebook has Word, Meaning and Example columns, search/sort, multi-select moves, folder creation/rename/removal, and export of the current folder. Removing a folder moves its words into Từ mới before removing the folder entry.

## Full tests

Open `/full-exam` from the library's Create full test button or the Full Test menu. A signed-in learner selects one published 40-question Listening test and one published 40-question Reading test. The share link stores only their test IDs, so it contains no answers or personal progress.

1. Listening runs for 40 minutes after all audio finishes downloading.
2. Submission (including timeout) saves Listening answers without grading and opens the Reading transition screen.
3. Reading runs for 60 minutes. Final submission sends both answer sets to the authenticated `/api/full-exam/submit` endpoint, which loads trusted published tests and private answer keys.
4. Both scores appear together with question/transcript/explanation review. Two history entries share a full exam ID. These are two skill scores, not an overall four-skill IELTS band.

Progress is saved on the current device under the signed-in account; reopening `/full-exam` offers Resume. A failed final grade retains both answer sets for retry. Result history uses stable attempt IDs so retry does not duplicate records. If source tests were edited, start a new full test instead of applying saved responses to changed questions.

## Admin subdomain (not activated by this PR)

The existing site uses `ielts.vungocmanhcuong.id.vn`; the matching subdomain would be `admin.ielts.vungocmanhcuong.id.vn` (the requested `.id` address is a different domain).

Activation still requires Vercel team authorization, adding the subdomain to this project, configuring the exact DNS record returned by Vercel at the authoritative DNS provider, and adding the hostname to Firebase Authentication → Settings → Authorized domains for Google sign-in. Do not change nameservers or buy a domain. The current `/admin` route and staff shortcut continue working.

## Validation

TypeScript, the production build and regression tests cover shared folder aliases/public pages, upload skill switching with audio retained, document order/page breaks, gain amplification, notebook folders, and the combined exam's selection/transition/final grading/retry boundaries. Browser pixels and live signed-in Firebase/R2 flows still require a preview session; test fixtures do not perform production uploads or create student attempts.
