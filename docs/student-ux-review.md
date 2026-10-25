# Student experience review

Scope: home, catalog discovery, history and review entry. This is a code-based heuristic review, not user research or a certified accessibility audit.

## Evidence and design decisions

- Nielsen Norman Group, Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/ . Keep frequent tasks visible and make advanced information clearly discoverable. Applied to mobile catalog filters and the sessions/insights switch in History.
- W3C, Understanding Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html . The AA minimum is 24 CSS pixels with exceptions; this implementation aims for 44px primary controls. It does not claim WCAG conformance.

## Findings addressed

1. Home mixed acquisition messages with returning-student needs. Returning students now get an explicit review action, actual attempt counts, weighted graded-question accuracy, target and a supported weakness summary. Weakness candidates need at least five graded responses; the sample count is visible. No predicted band or mastery claim is invented.
2. Catalog filters occupied attention and mobile space before results. Mobile filters now have an explicit disclosure control and applied filters can be removed individually. Search and sort stay available. URL-based filter state is retained.
3. History placed extensive analytics before retrieval of an old session. Saved sessions are now the default; complete insights remain available through an explicit view switch. Historical reviews still open the saved attempt in another tab.
4. Empty History had no direct recovery action. It now links to the practice catalog.
5. Visual hierarchy lacked consistent spacing and readable secondary labels. Student discovery surfaces now share card spacing, typography, contrast, focus treatments and responsive layouts. Reading workspace CSS is not targeted.

## Required visual acceptance review

Still unverified: real desktop/mobile rendering, 200% zoom, long translated titles, keyboard navigation through actual browser dialogs, screen reader announcements and contrast measurement against computed backgrounds. Local browser preview previously failed because the environment could not connect to localhost. Build success is not visual verification.

Review at 390px, 768px and 1440px. Check home as guest and signed-in student, catalog with zero and many results, multi-filter searches, history empty and populated, switching insights/sessions, saved review in a new tab, and admin isolation. Do not claim the overall student redesign complete before these checks.
