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
