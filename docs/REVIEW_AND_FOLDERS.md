# Reading review and folders

- Both Practice and Exam hide answer and explanation controls until a successful submission. Opening a test does not request solutions. Submitted answers are locked; reset/restart to attempt again.
- Explanation cards show the accepted answer above the explanation supplied in the source. Missing explanations are not generated.
- Complete 40-question tests with all keys receive a practice Academic Reading band. Single passages and incomplete answer keys show raw marks without projecting a full-test band. Official IELTS boundaries can vary slightly by test version: https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail
- Passage tabs and setup use actual reading titles. Generic older titles are recovered from source headings or centered title lines when the test is loaded. Standalone imported reading tests use their passage title.

## Organize the bank

Open Admin Studio. Select tests, enter a destination such as `Forecast / 2026 / Quý 3`, and choose **Move to folder**. The folder is shared through existing test metadata in Firestore. A folder appears when it contains tests; empty folders are not stored separately.

Use folder cards and breadcrumbs to browse. **Include subfolders** controls whether the result list includes descendants. Inside a folder, **Save folder path** renames or moves that folder and its descendants. Existing destination paths merge the contents without deleting tests. Sorting supports added/updated dates, natural titles, folder, question count, and duration. Learners can also filter by attempt status and sort by recent attempts.

For tests already imported before this update, choose **Update passage titles** in Admin. It updates selected tests, or the currently filtered tests if none are selected. This performs explicit reads and metadata writes; browsing the library does not fetch every passage. Titles for new imports are stored automatically.

No Firestore Rules change is needed for these features. The server IAM issue described in FIREBASE_RECOVERY.md is separate and still requires a deployment administrator to configure it.
