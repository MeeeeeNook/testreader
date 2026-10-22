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
