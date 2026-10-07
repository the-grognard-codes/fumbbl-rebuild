# UI overhaul retrospective — 2026-10-06

Snapshot: implementation verification before publication; the closing pull request records subsequent merge status.

This review compares the current `codex/ui-overhaul-remaining` worktree with [ADR 0003](../adr/0003-coach-oriented-angled-pitch.md), its [playable-match spec](coach-oriented-playable-match-ui.md), and all adjustment requests retained in this chat. It distinguishes implementation from remote merge and dev-local service state.

## Delivery boundary

The branch starts at main commit `cd70f87a5205b6ddce0c7fc92659ae87e19ec725` (PR #181). That merge delivered #174: three dugout modes and expanded-container drag/drop. The twelve other fourth-round tickets were still open when work began. They are implemented on this branch; this report does not claim they are merged or deployed. The original `codex/fix-new-match-ui` checkout contains earlier uncommitted prototypes and unrelated changes and has been preserved.

Earlier chat rounds remain tracked under #127 and #145 and their children. Seeing those prototypes in a local browser did not establish their presence on remote main. The current source audit below identifies what remains, rather than carrying forward earlier local-build claims.

## Latest round

| Ticket | Delivered behavior | Evidence |
| --- | --- | --- |
| #167 | Held HUD/pitch interaction avoids native blue selection; input/chat/log text remains selectable; setup player dragging remains available | Real mouse selection reproduction failed before CSS fix; `round-four-ui`, `setup-drag-ui`, existing chat editing checks |
| #168 | Heads/Tails and Receive/Kick use MUTP typography and palette | Computed font and exact keyboard choice IDs in `round-four-ui`; production reroll/choice tests |
| #169 | Debug sits directly left of Game Menu; drawer exposes camera, valid server options and route details | 1280×720, 640×330, 375×300 adjacency; toggling sends no game action |
| #170 | Board clicks start/add waypoints, clicking an earlier waypoint truncates, Confirm commits; no planning dialog | Route fixture retains native preview and commit identity; Backspace undoes, Escape clears |
| #171 | Perspective setup faces the opponent regardless of last placement direction; top-down standing art is direction independent | Both coaches, 30/40/50 degrees and top-down; state-specific prone/stunned art preserved |
| #172 | Only two eligible friendly players already on the pitch can swap, atomically | Native legality, actor/stale rejection, one revision, duplicate retry and recovery tests; reserve-on-occupied rejected |
| #173 | No Entries X–Y of Z counter in match or menu log | Shared MatchEventLog removal; log text size and paging retained |
| #174 | Exactly title-only, counts and expanded vertical states; expanded container accepts pitch-to-reserve drops | Already merged in PR #181; both-coach browser round trips remain covered |
| #175 | Tight translucent dice box centered halfway from field center to left edge | D6 and 1/2/3 block faces, viewport containment, no normal horizontal scrollbar, exact choice IDs |
| #176 | Persisted background opacity 0–100%, default 30%; contents stay opaque | Endpoint and reload tests cover resources, clocks, dugout, dice, chat and log; malformed storage defaults safely |
| #177 | Shared Confirm button confirms setup; native formation errors appear below setup state banner | Native wide-zone/line-of-scrimmage diagnostics survive exact retry/recovery; correction clears errors and remains editable |
| #178 | Football placeholder with circular inward pulse and four filled inward triangles | Canonical ball center in all views; pointer transparency; reduced-motion static behavior |
| #179 | Taller four-sided stadium with separate structure/crowd layers and reserved endzone walkway | Both ends and all angles; independent crowd hiding, travelling turf and reduced-motion checks; team crowd factory requirements recorded |

Owner clarifications govern the implementation: route clicks preview until Confirm; opacity changes backgrounds only; perspective setup facing does not override top-down; reserve drops never displace a pitch player. New requests supersede the earlier unboxed/central dice and extra dugout-condense designs.

Adjacent integration repairs implement the earlier right-button-pan/wheel-zoom request (#130) and Game Menu styling (#162). A pointer regression now protects the first left click after a right-button pan. Fullscreen and Exit were moved into Game Menu Interface to remove the overlapping window-controls row (#158); reconnect remains available when disconnected. These controls never submit a game action.

## ADR comparison

| ADR contract | Current assessment |
| --- | --- |
| Canonical 26×15 board, one projection shared by scenery, actors, ball and input | Retained. Camera tests cover geometry, hit testing and changing elevation/coach end. Setup swaps remain canonical native operations. |
| 40-degree zero-yaw travelling perspective; local 30/50 options; top-down tactical alternative | Retained. Mouse wheel now zooms; held right button travels; keyboard navigation and reveal controls remain accessible through Debug. Camera changes do not mutate state. |
| Opposite coach ends, upright identities, feet/ground/center anchors | Covered by existing geometry and updated art tests. Standing top-down is fixed; prone/stunned retain ground poses. Perspective setup faces the opponent. |
| Stadium moves with pitch, all boundaries share camera; HUD remains fixed | Separate scene layers travel together. Wraparound structure/crowd replaces painted sideline repeats. The former painting is clipped to turf; it cannot leave baked spectators when the crowd layer is hidden. |
| MUTP fonts, navy/cyan/gold palette; translucent surfaces with readable controls | Latest prompts/menu and adjustable backing now follow this. Header sizing, chat controls and visible weather still have older open tickets below. |
| Authoritative reviewed actions, native choices, setup drag/drop and legal formations | Existing action identity and reconnect checks retained. Setup exchange is one persisted operation; errors derive from native validator rather than a separate client legality model. |
| Dice animation does not delay decisions; state/transcript/replay remain authoritative | Existing playback and exact native choice checks pass. The later request to accumulate successful d6 for one second is still a separate gap. |
| Keyboard/text alternative and reduced motion | Setup keyboard placement retained; route undo/clear and Confirm keyboard access retained. Ball pulse stops with reduced motion. Screen-reader observation and foreground hardware acceptance are not newly established by headless tests. |
| Integrated acceptance and performance | Prior reports remain historical evidence. This round uses native/session tests and production-component fixtures. It does not prove a new authenticated full match or eliminate the owner's GPU-specific 30-degree tearing report. |

## Earlier ad hoc requests: reconciliation

| Requests / tickets | Status in this branch |
| --- | --- |
| Quick Snap: open player then one square; correct highlights; moved/allowed count (#128) | Native one-square eligibility exists, but the requested complete selection flow and counter are still pending. |
| Black/missing regions at 30 degrees (#129) | Camera/scenery tests and captures are present. Foreground owner-hardware reproduction and acceptance remain necessary; headless success cannot close this report. |
| Right button travel, wheel zoom (#130) | Implemented and tested here, including first left click after pan. |
| Player shadows and square alignment (#131–132) | Existing projected ground shadows and anchors retained and tested. Owner visual acceptance of the reported offset remains distinct from geometric checks. |
| Touchback and prominent game-event text (#133–134), narrowed scope (#160, #163) | Setup banner exists; no ordinary-turn banner is shown. Touchback/Quick Snap/Charge/High Kick event broadcast coverage is still pending. Charge must identify the kicking team, following the server owner. |
| Smaller MUTP follow-up without screen fade (#135) | Compact decision dialog and transparent backdrop now retained under MUTP styling. |
| Central dice (#136), later tight left box (#175) | Superseded by the latest left-quarter boxed dice requirement and verified accordingly. |
| Log font selector (#137) | Three sizes pass existing HUD checks. |
| Block dice no scrollbars (#138) | Updated boxed-roll checks retain unboxed faces and viewport containment. |
| Icon-only team reroll and unique Pro/Brawler/Dodge/etc. buttons (#139–140) | Native choices retain correct identities, but unique skill artwork/icon-only presentation remains pending. |
| Accumulate successful d6 sequence, clear ~one second after last roll (#141) | Pending: current playback replaces each moment and clears after the existing short animation. |
| Drawer camera/options/route details (#142) | Implemented here with relocated Debug (#169). |
| Mouse-selected ball kick square (#143) | Existing offered-square selection path retained; new round does not establish dedicated native kickoff acceptance. |
| Top-down direction independence and prone/stunned sprites (#144) | Implemented and covered across both coaches here. |
| Dugout condensation/docking (#146), later exactly three modes (#174) | Latest three-mode design supersedes hamburger/extra view; vertical drag/drop is already merged. Bottom-side docking retained; dedicated chat/log alignment remains a visual acceptance item. |
| Equal clock/resource/nameplate height and aligned tops (#147–148, #157) | Still pending: current center has fixed height while resource/clock sizing can differ. |
| Menu below right resources (#149) | Relocated adjacent Debug/Menu controls now occupy the top-right area; exact header alignment awaits the size work above. |
| Weather icon/text between turns, short labels Nice/Blizzard/Rain/Heat/Sunny and no black panel (#150, #159) | Pending: visible weather slot is currently empty; debug weather text is not the requested HUD. |
| Smaller command bar and shorter Confirm padding (#151–152) | Older requested sizing changes still require implementation/visual acceptance; this round replaces setup confirmation behavior, not all sizing. |
| Cancel on other friendly player/empty square, except adding route waypoints; remove × (#153) | Selection resets pending proposals and route mode preserves waypoints. The explicit Cancel button still exists and must be removed to fully satisfy the request. |
| Chat no message count, independent A controls (#154) | Pending: chat still has message count and Write message control. |
| Less top padding above Game Log (#155) | Pending visual sizing ticket. |
| Endzone walls/crowd, no goalposts, cheerleader strip (#156), taller separated layers (#179) | Wraparound and reserved walkway delivered by latest stadium work. Team-specific crowds and cheerleader artwork are future asset work. |
| Remove Connected/Fullscreen/Exit overlay (#158) | Implemented here; fullscreen/exit remain accessible inside Interface. |
| Fully fleshed-out weather icons (#161) | Deferred asset work remains in TODO; it is not claimed delivered by the placeholder stadium/ball work. |
| MUTP Game Menu (#162) | Implemented in this branch, with slider included in focus navigation. |

## What went well and what must change

Native validation remained the source of truth. Independent review caught an optional diagnostic-field mismatch in the legacy decoder before delivery; both protocol paths now have bounded acceptance and private-field rejection. Red reproductions caught accidental selection, setup-facing behavior and the dropped first click after right pan. Fixtures retained exact command identity and reconnect rather than only checking appearance.

The main failure was delivery bookkeeping. A ticket being scoped, a dirty local prototype appearing in the browser, a branch implementation, a successful production build, a remote merge and a running dev-local artifact are six different states. Reporting them as one completion state obscured the twelve outstanding tickets and the older unresolved batches. Future rollups should carry a per-ticket source branch/commit, verification evidence, merged PR and served artifact identity. Keep the original dirty checkout separate from the reviewable implementation worktree.

Changes to interaction contracts also require updating the shared browser helpers. Wheel-based reveal became invalid when wheel changed to zoom; testing real right-button travel exposed a product bug that DOM-presence checks missed. Similarly, relocating Game Menu hid Exit underneath it; hit-target review identified the overlap and the already-requested removal of that overlay resolved it.

The remaining gaps above already have tickets. They should stay open until implemented and accepted; this retrospective does not close them based on prototype evidence. Final team crowd/weather/cheerleader art and owner hardware/screen-reader acceptance must be reported separately from code and fixture completion.
