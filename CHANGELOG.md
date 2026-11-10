# Changes

## Unreleased

- Deliver queued updates when the next publication has budget. After three attempts with at least 500 ms available, release delayed payloads and automatically refresh the authorized view while preserving the board. Coalesced live history recovers through paged transcript reads.

- Keep delayed publication recovery independent per match and send only the latest queued state, preserving chat order without disconnecting viewers for obsolete snapshots.

- Catch up missed match, chat and preparation pushes after an action exhausts its budget, so turn handoffs and final results do not wait for another action or reconnect.
- Firebase authentication now bounds key retrieval, credential refresh and
  revocation checks within one admitted operation. Provider outages fail closed
  and trip a shared circuit breaker so queued requests can continue; existing
  incoming-request freshness and immediate local permission checks are preserved.

- Passive state, chat and preparation updates refresh local authorization in one
  batch and stop at the original token expiry. Provider-only revocation can leave
  passive viewing available until that expiry; incoming provider checks remain
  unchanged, and observed rejection removes subscriptions. Exhausting the actor's
  request budget skips that best-effort push while preserving valid subscriptions.

- Spectator broadcasts exclude actor-only formation controls and block previews.

- Browser worker tasks share a monotonic two-second request budget independently
  of diagnostics. Operational counters include full ingress, decision expiry and
  disconnect cleanup execution, queue wait and budget overruns.

- JDBC work uses deadline-capped connection and network limits, one-second
  session lock waits and a shared outage breaker. Durable retries reconcile lost
  membership, account-creation and skill-preference acknowledgements; refused
  commits remain distinct from unknown commit outcomes. A small bounded pool
  reuses clean read sessions and discards changed sessions before another request.
  Stale idle sessions reconnect before application work; nested recovery loans
  share one probe, and request-deadline expiry preserves write uncertainty without
  opening the database outage breaker.

- Dev-local Hosting uses the stack's verified credentials in an isolated CLI
  configuration, avoiding startup authentication errors from an expired CLI login.

- Added `dev-local --start|--restart --quick` for manual testing with browser
  validation and server test execution skipped. Default starts and deployments
  keep full validation; quick starts do not count as handoff evidence.

- Riotous Rookies receive local `RiotousRookie #n` names without contacting a
  name service. Removed the unused FUMBBL service URL properties and HTTP helpers,
  along with the legacy remote roster-download tool and unused signing keystore;
  MUTP uses its bundled roster data.

- DEV and dev-local diagnostics can collect optional correlated database,
  compression, response queue/write and browser processing traces. Versioned
  capture exports and offline reports show phase timing, history sizes and
  missing or truncated evidence for performance investigations. Detailed tracing
  preserves independent basic timing, outer-phase observations and server logs;
  reports distinguish pending, ineligible and invalid detail evidence. Basic
  timing takes priority over detail traffic; unobserved errors retain unknown
  trace eligibility, and capped span collection uses a per-phase index.

- Gameplay authorization refreshes local identity, account and scopes in one
  database query. DEV diagnostics refreshes no longer rerender gameplay solely
  to update counters and graphs, and pitch hover hit tests are coalesced across
  response commits. Recovery protocol lookups avoid repeated enum-array
  allocations. Server timing logs distinguish local permission
  checks, provider reuse and checkpoint cursor/fingerprint preparation.

- Pitch panning retains the grid in the camera's ground plane and avoids
  unrelated HUD layout measurements. Player cards now use fixed team sides:
  home on the left and away on the right, including replay.

- Added offline review reports for performance captures, with grouped incidents
  and selected timing evidence for support or chat review. Support now explains
  how to capture DEV performance problems and email the exported JSON for review.

- DEV and dev-local matches now offer opt-in frame pacing, network I/O, response
  timing and presentation diagnostics, with configurable scrolling graphs,
  inspection, bounded private capture exports and optional server timing/probes.
  The Debug menu is hidden in PROD.

- Sign-in now offers Google, Microsoft and email links with clearer loading,
  recovery and email guidance. Support includes Microsoft account sign-in help,
  and `/signin` opens the existing sign-in page. Provider buttons use official
  Google and Microsoft icons; site tabs use the approved MUTP favicon.
  Microsoft sign-in targets personal accounts to match the app registrations.
  Sign-in failures show support error codes and record sanitized browser diagnostics.

- Added separate DEV and PROD Microsoft Entra publisher-domain verification files
  to the Hosting artifacts at `/.well-known/microsoft-identity-association.json`.

- Support now opens with topic links, Google and email sign-in troubleshooting,
  and a direct contact route. Sign-in pages link to the help, while existing
  device guidance and the scaling calculator remain available. Sign-in pages
  use clearer 12px button labels and omit redundant labels above their headings.

- The home page now leads with coaching and a three-step route into a match.
  Development combines the project's educational background and searchable merged
  PR history, replacing Updates in navigation while keeping old links working.

- Team Builder now uses a compact workbench with recruitment and resources beside
  the editable roster, a shared budget/validation/save strip, top-level saved-team
  access, and optional kit customization. Validation can jump to affected fields,
  and starting or loading a team protects unsaved draft changes. Formation pitch
  cells stay square and numbered markers fit within them on narrow screens.

- Saved teams can manage three offensive and three defensive deployment formations
  with numbered chits, starter layouts, and a default for each role. Drive setup
  loads the default and offers formation buttons; unavailable players leave holes.
  Computer coaches choose saved formations and complete legal setups.
  Starters include 5-4-2 and 7-2-2 Offense, corrected Chevron Defense, and Anchor
  Defense. Setup selection aligns with the chat/log panels, with Confirm above it.

- Touchdown scores update when the TOUCHDOWN announcement starts; the next-drive
  tracker waits until it finishes. Mandatory decision prompts keep Game Menu and concession accessible.
- Explicitly confirmed Pass actions now offer a small square-targeting toggle,
  supporting empty or occupied targets after planned or completed movement.
- Failed Loner/Pro tests preserve the original dice. Proposed block dice remain
  above prerequisite rolls and reroll choices until the block resolves or is cancelled.
- Bogruk participates in kickoff events and uses Apothecary, Bribe and Argue the Call.
  Random accepts those resources half the time; both keep the least harmful injury result.
- Removed the stray black outline behind both turn counters.

- Non-block dice now show approved event icons and concise result captions, with
  independent icon/text controls in Game Menu > Interface. Preferences apply to
  live play, replay, and recovery; scatter arrows follow the pitch view, and
  casualty rolls show the extra D6 only when it supplies an injury detail.

- Portrait and helmet kit shading now matches player-sprite base tones, including
  the two-tone contrast when primary and secondary use the same palette color.

- Approved Human and Orc portraits and splash helmets now share the production
  team-color masks across the builder and match views, with updated static fallback
  artwork, rich shading, and fixed skin, metal, leather, and spike colors.

- Saved Human and Orc teams can choose primary and secondary kit colors from the
  approved palette, with immediate builder previews. Match artwork uses the colors
  frozen at create/join across play, recovery and replay; older matches retain their
  original artwork.
  Recolorable details include hair ties, shoulder and shoe trim, helmet rims and
  worn helmet paint; exposed metal and facial features retain their materials.
  Reviewed bust masks preserve faceguards, pauldron rims, rivets and leather
  borders while retaining the surrounding primary and secondary kit regions.

- Retired the development-only V1 browser runtime and diagnostic client. Play,
  replay, and maintained diagnostics use V2; public `/play` URLs and existing
  saved-data compatibility are preserved. Existing diagnostic database volumes
  are retained without migration or deletion.

- The match Reconnect control can restore an unavailable view even when its
  WebSocket remains connected, without automatically repeating gameplay actions.

- Added a development-only shared sprite proof with 16 saturated color choices and 16 shades per ramp, all 256 combinations, lineman/halfling/ogre animations and busts, and Human helmet previews. Projected Pixi playback includes both coach ends, pause/step, reduced motion, static fallback and a 22-player comparison. Recorded the authoring/rendering contract for later production team colors and animation integration.

- Added the approved compact horizontal decision prompts, mole artwork, player focus connectors, and preview/confirm interception selection. Player decisions keep pitch navigation available. BB2025 Secret Weapon send-offs now resolve one selected player at a time, retaining bribes after coach ejection and preserving pending choices across recovery.

- Removed support for older Blood Bowl editions from the engine, bundled fixtures,
  and active tools. MUTP now loads BB2025 only; current gameplay and newly created
  replay/recovery records retain the BB2025 implementations.

- BB2025 kickoff events and touchbacks now use pitch selection followed by confirmation.
  Quick Snap locks its participants before movement; Solid Defence keeps players on
  the pitch and supports swaps between selected players. Touchbacks clear the
  recipient selection before the turn begins.

- Added approved horizontal decision-prompt mockups and a reusable MUTP mole/chibi
  artwork template with source images and generation prompts. Production prompt
  integration and Secret Weapon sequencing remain separate implementation work.

- Confirm planned moves, blocks, blitzes, fouls, teammate passes and handoffs by
  doubleclicking or double tapping the selected final destination or target once
  Confirm is enabled. The target-selection click is separate from confirmation.
  Touch input shows Cancel plan; mouse input retains right-click cancellation
  and waypoint undo.

- Browser V2 announces confirmed turnovers with their cause, touchdowns, and numbered
  team-turn starts using dimmed pitch overlays. Announcements support safe dismissal,
  a saved Game Settings preference, transparent banners with smooth fades and a pause between queued announcements,
  a close box when held, reduced motion, replay, and persistent match-log details.
- Bug fix roundup #5: successful movement rolls no longer pause movement;
  partial rerolls animate only the rerolled dice. Resource and player tooltips
  appear above other match elements without duplicate native tooltips, and chat
  closes after sending. Existing weather-dice timing is retained.
- BB2025 now exposes Jump Up block targeting and Punt direction planning through
  the player action controls. Jump Up targets show normal block assists and proposed
  dice for the block following a successful Jump Up. Declared Punt has a separate targeting pop-out with
  a crosshair icon, keeping targeting available after its declaration is spent.
  Kick placement previews belong only to the kicking
  coach, and prone players may declare Throw or Kick Teammate without an available target.
- BB2025 skips pointless Kick choices when both results are touchbacks, applies
  Eye Gouge after qualifying standing push results, and completes On The Ball
  and Pile Driver decisions without consuming an extra limited-action allowance.
- On the Ball uses circular skill prompts and supports a planned path of up to
  three squares per accepted player. Finishing consumes that player's reaction,
  and computer coaches no longer loop between selecting and finishing it.

- The support page now explains desktop, landscape tablet and phone viewing,
  mouse/keyboard and touch input, recommended CSS viewport sizes, and estimated
  hardware for future animated matches. A display-scaling calculator translates
  viewing targets into physical-pixel content areas at 100–200% scaling.

- Signing out from the account menu reliably returns keyboard focus to Sign in,
  including browsers that clear focus when the Sign out button is disabled.

- All Java modules now require Java 21 or newer and compile for Java 21. Build,
  bootstrap, CI and setup use one Java 21 toolchain; historical documentation and
  stored-match compatibility boundaries remain preserved.

- MUTP supports browser clients only. Browser V2 is the standard server runtime.
  Retired clients and their exclusive
  server services, distribution and operational workflows have been removed.
  Existing browser behavior and game rules are preserved. Historical games and
  replays from retired clients are not supported.
