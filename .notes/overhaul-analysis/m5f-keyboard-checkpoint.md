# M5f keyboard and text companion checkpoint — 2026-09-25

The hosted match now has a labeled text companion after the visual board. Its live text states the focused square, occupant and condition, ball, count of server-issued targets, focused player and selected player. A native disclosure opens 390 labeled square buttons with one Tab stop, arrow-key movement, Enter/Space selection, Shift+Tab exit and Escape clearing. Focusing a sprite updates the same text. The action menu and visual board still use the same current server action IDs and guarded Commit handler; the companion does not infer legality, paths, dice or odds. Home/away text, jersey numbers and dashed target borders supplement color. The detailed roster is available through a native disclosure.

Space now commits only when the pitch viewport itself has focus. Space on a player button, square, selector or text input retains that control's native behavior. Repeated held Space, an unpinned target, pending outcome, disconnected state and spectator role cannot send a new command. At zoom above Fit, arrow keys pan the focused pitch viewport. Native Fit/zoom buttons and reduced-motion CSS remain available.

## Keyboard control inventory

| Surface | Keyboard path and text | Evidence |
| --- | --- | --- |
| Pitch marker and player details | Tab reaches each marker; its name, team, number, state and square are labeled; focus updates the text companion; Enter/Space selects | [Hosted keyboard browser test](../../site/test/m5f-keyboard-browser.test.mjs) |
| Text pitch and target preview | Summary opens with Enter/Space; Tab/Shift+Tab enters/leaves one roving square stop; arrows reach all 26×15 squares and scroll the final row into view; Enter/Space selects a square or player; Escape clears selection; ball and target are named | Same browser test; [companion screenshot](verification/m5f/companion-1280.png) |
| Server action, End Turn and Commit | Native selector and buttons pin the current server action; visible Commit and focused viewport Space use one handler; no mutation from marker/grid/text-entry Space or held Space | Same browser test; [M5d Blitz test](../../site/test/m5d-blitz-browser.test.mjs) |
| Fit, zoom and pan | Native zoom buttons; focused zoomed viewport pans one pitch square per arrow key | Same browser test |
| Score, resources, off-pitch roster | Text labels and native player buttons; full roster opens with keyboard-accessible disclosure | DOM/browser contract; no separate AT speech observation yet |
| Coin/receive, setup placement, other action families, save/resume, reconnect/exact retry | Existing native buttons, selectors and inputs; server actor and pending guards remain in `GameView`/`V2Client` | Existing v2 action/route/recovery tests; actual keyboard and AT observations across these phases remain an R6 check |
| Full time and result replay | Native result link and replay buttons; replay pitch is read-only | [M5e result browser test](../../site/test/m5e-result-browser.test.mjs) |
| Match log/chat, exact KO/casualty categories, risk percentages | No live v2 contract; no controls or invented labels | Contract gaps in [M5e checkpoint](m5e-match-presentation-checkpoint.md) and `TODO.md` |

## Verification boundary

Chrome 153.0.8010.53 on Windows through Playwright 1.62.1 exercised the keyboard paths at 1280×660, including actor and spectator. Browser-client unit tests, hosted browser tests and static-site checks passed on this branch. This is automation and visual inspection, not observed screen-reader speech. NVDA with Chrome/Edge, VoiceOver with Safari on a Mac, Firefox, iPad, 200% browser zoom and human UI review remain part of the R6 integrated matrix. Accessibility remains a post-visual-MVP release check; this slice establishes the companion and automatable path after the DOM/SVG decision.
