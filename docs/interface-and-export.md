# Interface and document export update

The landing page uses a centered hero over a muted green, ivory and blue animated mesh. Motion stops when the browser requests reduced motion. Navigation provides Practice Test, a folder-based Full Test menu, Test history and Vocabulary. The Full Test menu lists folders containing published full tests; the owner can use Edit folders to rename folders or move tests. Hard-coded Forecast/VOL/Cambridge links are removed.

Sign-in has a dedicated /sign-in page with Google only. No GitHub, Apple or email/password provider was added. Guest history and vocabulary routes explain account benefits and link to sign-in with a safe local return URL. Firebase admin identity checks remain unchanged.

All authored select controls use one accessible custom combobox/listbox component, including test answer fields, filters, folder pickers, preferences and editor tools. It supports keyboard navigation, Escape, option search for longer lists and standard form values. Native file upload and date controls are retained.

The test editor uses Tiptap for passages, question layout and explanations. It includes paragraph/heading styles, fonts and sizes, line spacing, left/center/right/justified alignment, bold/italic/underline/strike, lists, quotes, links, images, editable tables, highlighting, color and undo/redo. Answer placeholders are atomic question chips and survive serialization. Explanation editors load when their question is expanded. Only explicitly safe formatting and links survive the sanitizer; script, event-handler and unsafe URL content is stripped.

Word/PDF export now removes repeated titles and generic Part labels, avoids duplicate question numbers and repeated TRUE/FALSE choice lists, preserves paragraph and explicit line breaks, and uses readable spacing. Questions and the answer table start on new pages. Word uses A4, Times New Roman, black text, a centered title, fixed table widths and repeating header rows. The explanation column gets most of the page width. Missing explanations remain blank.

Study profile edits are staged in a form with save/reset. It includes display name, target band, test date, a weekly test goal and reading font size, plus actual completed attempts, average full-test band, saved-word count and weekly progress. Personal JSON backup excludes admin folder metadata. No Firestore rules change is required for these profile fields.

Validation covers custom control keyboard behavior and form values; real editor centering/undo/answer-chip persistence; staged profile saving; navigation; duplicate-free export content; and DOCX table widths, page breaks and header repetition. Existing import, grading, history and access tests remain part of the full suite.

The previously reported production scoring API Firebase credential issue is not changed by this UI update. Live guest grading, solutions and answer-inclusive exports still require working Firebase Admin access. Authenticated owner actions cannot be verified with a guest browser session.
