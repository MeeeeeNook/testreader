# Listening player, results and admin update

- Listening uses Part labels. The student player has one compact control row, exact speed stops from 0.80 to 1.25 in increments of 0.05, seeking and part markers. Test mode keeps one continuous play and disables speed changes and seeking.
- All unique recording files download completely before the workspace mounts or starts its timer. Progress, cancellation and retry are visible. Audio object URLs exist only for the mounted session and are revoked afterward.
- Submission pauses audio immediately, before scoring. Every submission opens a dedicated score screen with review and finish actions. Answer Sheet is beside Submit and groups response cards by part, including unanswered and flagged filters. Correct keys appear only after grading.
- Shared recordings use each part start timestamp; the next divider supplies the prior part end unless an explicit end is set. Admins see a divider prompt for full recordings. Partial or non-increasing divider edits cannot be saved. Unknown timestamps are never guessed.
- Timed practice asks whether to submit or continue without a limit. Timed tests submit automatically. Countdown uses elapsed clock time, including delayed/background ticks. Signed-in history saves mode, start/completion timestamps and active elapsed seconds; older records show that elapsed time was not recorded.
- Full Test links directly to its dedicated catalog page. Folder query strings preserve skill/view; mixed Listening tests require clip boundaries for shared source recordings.
- Imports default to Published with Draft still selectable. The app has an SVG favicon on SPA and server-rendered pages.
- Admin tables have a shared dense table and pagination footer (10/25/50/100 rows per page). Student management has its own account details and history pages, Firebase Auth creation/last-sign-in data, suspension and confirmed deletion. The verified owner account cannot be deleted. Deletion clears the sign-in account, attempts and vocabulary and retains only a minimal suspended UID record to block old sessions.
- Band estimates retain skill-specific IELTS raw-score conversion. Added accuracy, completion and next-band analysis. Partial tests or missing keys do not produce a band. No uncalibrated difficulty weights, timing penalties or invented formulas are used.

## Verification

TypeScript and production build pass. All 159 runnable regression tests pass, including authorization/deletion safeguards, complete audio preloading with cleanup, marker jumps, exact speed steps, pause-on-submit, answer sheet behavior, score-first submission, history fields and both timeout modes. The existing localhost hosting smoke test is excluded because the execution environment disallows its network listener. Browser screenshot runs produced no images, so desktop/mobile visual and real audio playback checks remain necessary on a preview deployment.

## Preview smoke check

1. Open a four-recording test. Wait for the loading gate, then play and jump between parts in practice. Submit during playback; confirm sound stops and the score screen appears.
2. Open Answer Sheet beside Submit before finishing. Check grouping, flagged/unanswered filters and question jumps. No answer keys should appear before submission.
3. Review answers from the result screen and verify the compact transcript/question panes on desktop and mobile. Test speed at 0.80, 1.00 and 1.25.
4. In admin, edit a shared recording to starts such as 00:00, 07:15, 14:10, 21:05. Save, reopen and verify part jumps. A partial/non-increasing set must fail with an actionable message.
5. Use short practice and test timers; verify prompt versus automatic submission. Check the resulting mode and elapsed time in history.
6. Review an ordinary student account, load history and change status. Account deletion is irreversible: test it only with an expendable account, never with an existing learner for a smoke check.
