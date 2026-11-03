# Changes

## Unreleased

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

- MUTP supports browser clients only. Browser V2 is the standard server runtime;
  V1 remains development-only diagnostics. Retired clients and their exclusive
  server services, distribution and operational workflows have been removed.
  Existing browser behavior and game rules are preserved. Historical games and
  replays from retired clients are not supported.
