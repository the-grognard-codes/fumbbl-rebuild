# MVP match window and live presentation

Issue: [#50](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/50).
Branch: `codex/mvp-match-window`.

## Scope

Bring the authoritative `/play/match` page toward the accepted concept 02 in
`.notes/art-preview/pitch-and-ui-requirements-v2.md`. Keep server-issued
decisions, reconnect, direct links, reload and spectator behavior intact.

## Acceptance

- Start Game reserves a compact browser popup during the click, enters it only
  after the server confirms activation, and uses the current tab if the popup
  is blocked or closed. The match page offers a visible exit and a user-initiated
  fullscreen control with a visible way back.
- At 1920×900, 1920×820 and 1280×660 CSS viewports, the scoreboard, action
  controls, complete Fit pitch and compact off-pitch strip remain visible
  without page scrolling. Selected player details and the full authoritative
  off-pitch roster remain accessible.
- Live pitch, scores, turns, rerolls, weather, player details and decisions use
  only server data. Match log/chat, exact reserve/KO/casualty buckets, player
  attributes/skills and odds wait for versioned server contracts (#42, #37 and
  follow-up projection work).
- Preserve text pitch, keyboard actions and reduced-motion behavior from M5f.
  Record screenshots and focused browser/client checks.

## Baseline gap and implementation order

1. Compare accepted concept 02 with M5e screenshots and record viewport gaps.
2. Resolve supported popup/fullscreen/PWA behavior from browser documentation
   and local browser checks; choose a launch pattern with exit and fallback.
3. Tighten the live match frame and pitch sizing; integrate compact selected
   player and off-pitch strip with an expandable roster.
4. Verify authoritative action, reconnect and keyboard paths; capture acceptance
   screenshots and record unresolved parity.

## Current-versus-MVP inventory

| Area | M5e baseline | This candidate | Remaining parity |
| --- | --- | --- | --- |
| Page frame | Site header and 1100px content width at 1920; pitch and bench below fold | Match route takes available viewport width; visible exit, compact title and status | Human visual review on target displays |
| Typography and scoreboard | Generic blue bordered, three-part score row | Bundled MVP Alegreya/Barlow fonts, five metal panels, roster-linked helmet art and Nice weather icon; score/turn/rerolls from v2 | Team display names and other resources need projection fields |
| Pitch and sprites | Authoritative SVG pitch and frozen-roster sprites, but constrained board | Preserved those assets and Fit/zoom/pan in a viewport sized for 1280×660, 1920×820 and 1920×900 | Wider browser and display checks |
| Player and bench | Text player card and always-visible off-pitch list | Sprite player card and compact home/away off-pitch counts with an expandable full list | Structured reserve/KO/casualty categories need versioned projection |
| Actions | Select/Commit above board; detailed actions below board | Same server-issued actions and guarded Commit; details available in the side panel | Full native-engine session remains an integrated test |
| History and chat | No live contract | Still absent | #42 is the versioned transcript/chat work; no illustrative content copied into live play |

Reference captures: [accepted concept at 1920×820](verification/mvp-concept-1920-820.png),
[accepted concept at 1280×660](verification/mvp-concept-1280-660.png),
[M5e live baseline at 1920×820](verification/m5e/match-1920.png),
[M5e live baseline at 1280×660](verification/m5e/match-1280.png).
Candidate captures: [1920×900](verification/mvp-match/match-1920-900.png),
[1920×820](verification/mvp-match/match-1920.png),
[1280×660](verification/mvp-match/match-1280.png).

## Browser presentation decision

`window.open()` with `popup=yes` requests a minimal separate window during the
Start Game click. The browser decides whether it is a window or tab and which
controls remain. Server activation still gates navigation. The match has an
Exit match button that closes a script-opened window, or returns a direct or
same-tab match to `/play`; popup-blocked activation uses that same-tab route.
A separate Fullscreen button requires a click and reports an unavailable request.
No automatic fullscreen or installed PWA is required. Chromium browsers can
offer `standalone` installed PWAs, but Firefox desktop does not support
manifest-based PWA installation; installation would add a user step and would
not make the existing Start Game click universally open a chrome-free window.

Primary browser sources:
[MDN window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open),
[MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API),
[Edge standalone PWA guidance](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/best-practices),
[MDN PWA installation support](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Status

The candidate passes the browser-client suite (78 tests), affected Java module
tests (`mvn -pl ffb-client-logic -am test`), site checks, the full hosted
Chrome browser suite (6/6), focused Edge popup/exit/fallback and result/replay
tests, and DEV and PROD Hosting
artifact assembly/verification. A browser assertion checks that the Fit scene
and bench fit 1280×660, 1920×820 and 1920×900 CSS viewports without horizontal
overflow. All browser automation used headless Windows Chromium; it cannot
validate actual browser-owned chrome. Firefox is not installed, and installed
PWA mode was assessed from primary docs rather than installed locally. Native
game-server projection shape and action handling were not changed; complete
native-engine play remains an integrated release check.

The reference preview uses illustrative teams, log and dugout counts; they are
not copied into live state.
The new icon atlas has ImageGen provenance under
`browser-client/public/preview/mvp-art/PROVENANCE.md`; the bundled fonts have OFL
notices. R6 public-use disposition remains a separate release gate for artwork.
