# Animated match splashes — implementation outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/565
Branch: `codex/565-animated-splashes`; isolated worktree `.worktrees/565`.

## Tier 1

Implemented shared enter → impact → hold → exit phases. CSS animates transform
and opacity only; React updates at phase boundaries. The existing queue retains
required-choice priority, dedupe, reconnect and seek suppression. Animation-end
completes exit with a timer fallback. Exit now fits inside the total duration.
Saved team ramps colour ribbons; text stays on dark navy independent of kit
contrast. Reduced motion retains fades and removes spatial child animations.

Review page: `browser-client/splash-review.html`, served by Vite.
Captures: `.tools/animated-splashes/round-{1,2,3}/` (local generated evidence).
Each round includes six timed frames per core kind at 1440 and 390 widths,
Human/Orc, gold/blue, black/black, white/ivory, and reduced motion.

### Visual review rounds

1. Initial captures exposed missing production font in the review page,
   descendant motion overriding reduced-motion CSS, and a wide headline
   transform overflowing its card. Fixed font loading, selector specificity,
   and bounded headline overshoot. The animated ribbon is contained.
2. Phone review controls consumed too much vertical space; review stage extended
   beyond its viewport. Ribbon origin did not distinguish teams and touchdown
   lacked its requested punctuation. Fixed grid sizing, directional origin and
   `TOUCHDOWN!`.
3. Captured corrected output at desktop and phone sizes. Text remains legible
   on a constant dark plate for extreme kit pairs. Motion uses stepped impact,
   restrained turn-start scaling, and a torn turnover ribbon. The helmet and
   ribbon carry identity; no copied third-party artwork or runtime dependencies.

### Validation

- Browser unit suite: 540 passed before final Tier 1 run.
- Announcement UI: ordering, dismissal, hold, mandatory choices, dedupe,
  hidden-tab recovery, reconnect, replay seeks/speed and responsive long text.
- Added phase assertions and 50 consecutive splashes with equal baseline DOM.
- TypeScript and production build passed.
- Final affected UI and unit validation pending below.

One colour UI run was interrupted by our source edit triggering Vite reload;
rerun without concurrent edits. No product failure inferred from that run.

## Remaining scope

Tier 2 authoritative kickoff/weather/half/final events; Tier 3 optional drama
and decorative effects; expanded review rounds and live Bogruk validation.
No merge, ready-for-review transition or deployment is authorized.

Tier 1 final validation: all 540 browser unit tests, announcement UI (including 50 splashes), team-colour UI, playback UI, DOM-growth UI, TypeScript and production build passed. No Java changes in Tier 1.

## Tier 2 implementation

The server emits kickoff facts when the native roll is resolved, retains them
through mandatory placement/bonus-action stages and checkpoints, and releases
them at the first regular playable turn. Deferred kickoff weather follows the
kickoff fact. Initial weather and later spell/restoration weather use native
weather-setting notifications. The client does not read dice or logs to invent
an announcement. INTRO and unchanged weather are suppressed.

Half-ending touchdowns retain the scorer name/number and authoritative score;
half-time follows them. Native match completion emits full time or concession
with score and winner/draw. Both old five-field announcement checkpoints and
new pending-kickoff checkpoints remain readable. Optional event headline/code
fields retain playback support for previously recorded core events.

Emblems: original 32-pixel geometric kickoff ball and whistle SVGs in
`assets/game/ui/match-events`; weather uses the existing approved sprites.
Headlines, reminders and scores are DOM text; the persistent live region emits
one message per event. Team ramps tint relevant ribbons, while shared kickoff
results and weather have neutral treatment. Full-time uses a dark score plate;
half-time and drawn results use the two team's colours.

Weather reminders were checked against the repository's BB2025 reference index,
[its linked weather table](https://bloodbowlbase.ru/bb2025/core_rules/the_game_of_blood_bowl/#weather-table),
and the engine's Catch/Pickup/Pass/Interception/GoForIt modifier collections and
StepEndTurn heat handling. Kickoff names/descriptions come directly from the
BB2025 engine enum, including its existing wording.

### Tier 2 review rounds

1. Seven kinds captured on desktop and phone. The review initially omitted a
   winner line and had no concession/draw selector; added those. The original
   review only covered portrait phones; added 844×390 landscape and 1024×768
   tablet. Added explicit exit frames and every engine weather/kickoff variant.
2. Expanded capture pass running under `.tools/animated-splashes/tier2-round-2`.
3. Final polish/capture pending.

### Environment and verification limits

Shared `.git/dev-local-state.json` identifies the main checkout as owner. Per
#565, this worktree did not take it over or stop it. Live Bogruk validation is
therefore replaced by the announcement harness and real native engine tests;
no claim of an observed end-to-end Bogruk match is made.

Pinned Maven 3.9.9 and JDK 21.0.11 are used. Bootstrap's network download failed,
so the existing archive was copied and checksum-verified. Dependencies were
copied to this worktree's own Maven cache. Sandboxed javac failed closing JARs;
the identical focused reactor run succeeded through approved host execution.
Eleven focused engine announcement tests and 542 browser unit tests pass.
The full clean install and expanded capture validation are in progress.

Tier 2 review round 3 completed: fixed emblem aspect ratio, broadened the pixel
football silhouette, separated copy from the lower ribbon, and made split-team
ribbons enter from opposite ends. 468 captures cover 1440×900, 390×844,
1024×768 and 844×390, every kickoff/weather enum, concession/draw/win, saved
colour extremes, reduced motion and exits. Representative captures are tracked
in `.notes/art-preview/animated-splashes/`.

The extended DOM-growth driver now warms a capped 100-row history, then presents
and removes 51 announcements through GameView. The 50 iterations after warm-up
have identical DOM counts. The earlier test attempt incorrectly supplied a
sparse transcript; the harness now respects revision-indexed records. No
product workaround was needed.

Tier 2 final validation: pinned Maven clean install passed all reactor modules (16m06s; ffb-statetest: 300 tests, 7 environment-gated skips). Browser: 542 unit tests, TypeScript/build, 574-asset check, announcements (including animation-end completion), team colours, playback, reconnect, and extended DOM-growth drivers passed. No rules changes. Tier 2 ready for draft review.
