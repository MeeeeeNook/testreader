# Workspace and library management

The global site header is hidden throughout both practice and exam sessions. The workspace toolbar stays available. Manual Submit opens a confirmation with the answered/total count; Cancel returns to the same responses. Confirm grades and locks the attempt. Timer expiry still submits automatically.

Practice cards use passage titles as headings, with the original Passage/Section position in the small label. Legacy metadata with missing or generic titles is repaired from section content in batches of eight. Reads are deduplicated and the lightweight summary is cached by test revision. An owner session also saves repaired metadata to Firestore. No answer keys are loaded for title repair. If the source contains no detectable title, use the editor's title field; a retry control is available for failed reads.

## Admin additions

- Summary counts for published tests, drafts, content needing review and learners.
- Skill, publication status and content-review filters alongside folders, natural sorting and search.
- Pagination with 25 tests per page; select-all acts on the current page and preserves selections from other pages.
- Inline test rename; duplicate a test with a new ID as a free draft.
- Export selected tests, including their source answer keys, as an owner-only JSON backup. Existing JSON import accepts the backup wrapper.
- Passage names and metadata warnings in the test list.
- Editor checks for blank titles/content, missing keys/response controls, duplicate question numbers and missing listening audio. Checks are warnings rather than automatic edits.
- Editor controls for original passage position and detecting a title from source content.

Existing folder/subfolder moves, bulk publication changes, Trash/restore, archive, imports, question editing, reports, student attempts and article management remain available to the verified owner only.

Validation: TypeScript check, automated component/service tests and production frontend/backend build. Updating GitHub does not redeploy an independent AI Studio instance; sync the latest main branch and redeploy there. Firebase runtime IAM and live upload permissions depend on that hosting project's configuration.

## Admin sidebar and preview import

The owner workspace has its own sidebar with reloadable URLs:

- `/admin`: dashboard and shortcuts.
- `/admin/folders`: folder hierarchy, rename/move folders, contained tests and bulk moves.
- `/admin/tests`: test bank with filters, sorting, editing and bulk actions.
- `/admin/upload`: file/folder import entry point and instructions.
- `/admin/students`: learners and their attempts.
- `/admin/reports`: content reports.
- `/admin/content`, `/admin/contributions`: articles and contribution moderation.
- `/admin/archive`, `/admin/trash`: archive and deleted tests.

Choosing files or dropping a folder now prepares a local import plan. No tests or media are written at this stage. The modal shows file parsing errors, possible duplicate IDs, test/section/question counts, sandboxed passage/question previews, source answer/explanation counts and content warnings. Select individual tests, change names, override the destination folder, and choose draft/published. Draft is the default. Cancel or Escape disposes local image URLs and performs no import.

Confirm starts uploads for images referenced by selected tests, replaces temporary URLs throughout the test, then saves selected records. Existing complete IDs are skipped; legacy tests missing response controls retain the existing repair behavior and settings. The import report lists successful imports, skipped duplicates and failures. A fatal image-upload failure returns to preview instead of saving tests with broken local image links. Already-uploaded image objects may remain if a later operation fails.

Folders are derived from test source paths; empty folders are not persisted separately. Back/Forward changes admin pages normally. Authorization remains restricted to the verified owner account.
