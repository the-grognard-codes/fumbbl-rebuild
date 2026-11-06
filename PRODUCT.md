# Moles Under the Pitch

<!-- impeccable:product-schema 1 -->

Product priorities and brand commitments confirmed by the owner on 2026-11-06.
Repository references below supply current implementation evidence and detailed
asset specifications; historical material is identified separately.

## Platform

web

## Users

The primary users are Blood Bowl coaches who already know BB2025. They prepare
teams, make match decisions, play against other coaches or computer opponents,
and review matches. Spectators are a supported secondary audience.

Onboarding explains MUTP's controls, workflows, and interaction conventions.
Teaching the tabletop rules is not a core onboarding goal.

## Product Purpose

Provide a usable browser game for Blood Bowl coaches: build and retain teams,
enter matches, make informed decisions, and watch or review play. Product
decisions prioritize those coaching workflows. The owner's goal is to publish
the game for a wider audience of coaches.

MUTP began as a learning project focused on AI development. That history belongs
in material about the project's development, separate from the player-facing
product promise.

Success means coaches can complete those tasks, understand what the interface
is asking them to decide, and trust that accepted match decisions persist.

## Positioning

MUTP is an independent browser game where coaches build persistent teams, play
against people or computer opponents, spectate, and review matches. Match
recovery preserves accepted play across interruptions. Public-facing messaging
leads with the game and what coaches can do with it.

It is separate from FUMBBL services and accounts and is not affiliated with or
endorsed by an existing online service or publisher. Wider publication is an
owner goal, not a claim of an established audience or release readiness.

No exclusive competitive or market-leadership claim has been established.

## Operating Context

- Live coaching is desktop/laptop first, with landscape tablets as the intended
  touch-coaching format. Phones primarily serve website use, spectating, and
  replay; direct phone coaching is best effort.
- Mouse or trackpad and keyboard are the preferred desktop inputs. Touch input
  supports pitch and menu interactions. An on-screen keyboard reduces the
  available viewing space.
- The public website provides product entry, sign-in, support, and updates.
  Authenticated workflows cover team building and match participation; match
  access and replay visibility follow the application's permissions.
- Planned content change: move education and AI-development background from
  the front page to a dedicated area about the project's development. Live
  inspection on 2026-11-06 confirmed that the public homepage still leads with
  education and engineering language; this content migration has not shipped.
  Older documents may also retain the earlier framing.
- The supported full local application uses the managed dev-local workflow and
  serves `/play` and `/teambuilder` at `http://localhost:5000`. Development and
  production environments have separate authentication and service configuration.
  See [README.md](README.md) and [deployment usage](deployment/README.md).

## Capabilities and Constraints

- BB2025 is the only supported ruleset. Browser V2 is the sole supported client
  runtime and game protocol. Current match-ready team building supports Human
  and Orc exhibition rosters through the server's versioned catalog.
- Coaches can validate, save, reload, and edit account-owned teams, including
  player names and jersey numbers, team colors, and deployment formations.
- The server owns rules, legality, costs, eligibility, accepted outcomes, and
  ownership. Browser feedback and previews do not replace that authority.
- A **team draft** is unfinished work. A **saved team** is a validated,
  account-owned team. A **match team** is an independent frozen copy selected
  for one match; later saved-team edits do not change it.
- Match recovery preserves accepted state. Replay presents recorded play rather
  than reconstructing a new outcome from current saved-team settings.
- Reuse the domain language in [CONTEXT.md](CONTEXT.md) and the boundaries in
  [the team-builder contract](docs/team-builder-contract.md). The
  [completed-features tracker](.notes/completed-features.md) records delivered
  scope; it is not a promise of future roadmap items.

## Brand Commitments

- Use **Moles Under the Pitch** and **MUTP** consistently.
- The brand is original, welcoming, and lightly tabletop-fantasy inspired.
  "Technical" is not a brand personality trait. Engineering and learning details
  belong in development content; coach-facing communication leads with play.
- Preserve the original mole beneath a gridiron, the navy/cyan/gold identity
  with turf-green, rust, and off-white accents, and the approved pixel/chibi
  artwork. The current logo authority is
  [brand package v4](site/src/assets/brand-package-v4/README.md). Its outlined
  wordmark is approved artwork, not live text to recreate with a substitute font.
- Preserve the existing typography roles: Chakra Petch headings, Inter text,
  and pixel-style site navigation/controls, with Chakra Petch in the match HUD.
  Exact declarations remain in [site styles](site/src/assets/site.css) and
  [match styles](browser-client/src/coach-match.css).
- The brand palette and customizable team-kit colors have different purposes.
  Preserve the shared identity while allowing the approved team-color choices;
  the brand palette does not restrict every team's kit to those colors. Follow
  the [team-color contract](docs/specs/team-colors.md) and current implementation.
- Refine existing interfaces within these commitments. Changes to this identity
  require explicit owner direction. Retain original project assets and the
  [branding guardrails](docs/moles-under-the-pitch-branding-assets.md) against
  copying FUMBBL or Blood Bowl logos, character artwork, crests, and trade dress.
- Keep independence and non-affiliation statements accurate. Coach-facing copy
  should use familiar game terminology and explain MUTP-specific actions clearly.

## Source Authority and Historical Material

- Explicit current owner decisions govern product purpose and binding identity.
  This record confirms the approved baseline; it does not promote every file in
  the repository into a current requirement.
- Brand package v4 governs the current logo family. Its
  [manifest](site/src/assets/brand-package-v4/manifest.json) and README own exact
  colors, dimensions, clear space, optical variants, and export rules. Earlier
  brand packages and `brand-concepts/` studies retain historical/provenance value.
- [Canonical game art](assets/game/README.md) and the
  [sprite standard](assets/game/standards/team-sprite-standard.md) govern match
  artwork. Accepted later feature decisions can refine their scope; for example,
  team-color customization extends the original fixed-kit references.
- The [coach-oriented pitch ADR](docs/adr/0003-coach-oriented-angled-pitch.md)
  records the accepted presentation direction and its evolution. Current code
  and accepted outcome reports establish what is implemented; earlier renderer
  studies and comparison views do not establish current runtime requirements.
- The [branding inventory](docs/moles-under-the-pitch-branding-assets.md) mixes
  enduring originality/usage guardrails with education-era positioning and
  planned asset deliverables. Its checklist is not proof that every asset,
  contrast verification, provider upload, or marketing surface has shipped.
- [Font documentation](assets/game/ui/fonts/README.md) contains earlier preview
  guidance alongside the current match-HUD guidance. Use the current applicable
  styles and approved package for typography; do not apply the earlier
  Alegreya/Barlow preview pairing as a global replacement.

## Evidence on Hand

- [README.md](README.md), [browser-client guide](browser-client/README.md),
  [CONTEXT.md](CONTEXT.md), and [the team-builder contract](docs/team-builder-contract.md)
  describe the supported application, terminology, and data boundaries.
- [The support page source](site/src/support/index.html) records device/input
  guidance and distinguishes layout fit, hardware estimates, and physical-device
  validation.
- [The public-site critique and live follow-up](.impeccable/critique/2026-11-06T18-45-52Z__site-src.md)
  distinguish observed homepage, sign-in, and support behavior from untested
  failure paths. On 2026-11-06, the owner completed Google sign-in and a signed-in
  state was observed; the tested support calculator and disclosure worked.
- [The completed-features tracker](.notes/completed-features.md), linked outcome
  reports, and committed review captures provide implementation evidence.
- Canonical game assets live in `assets/game/`. Brand package v4 includes editable
  SVG masters, transparent PNG exports, a production preview, provenance, and
  verification records. The shared site header uses that package.
- Automated tests and browser emulation demonstrate the scenarios exercised;
  they do not establish universal usability, device certification, or performance
  claims. Public claims need evidence appropriate to the claim.

## Product Principles

1. Prioritize coaches completing real game tasks. Present MUTP as a game for
   players; give its learning and development history a dedicated place.
2. Explain MUTP's controls and decision flow while respecting the user's existing
   BB2025 knowledge.
3. Present authoritative game state and actionable choices clearly; preserve
   server authority over rules and outcomes.
4. Protect team ownership, accepted decisions, and match continuity across edits,
   reconnects, recovery, and replay.
5. Match interaction expectations to the usage context: desktop coaching first,
   landscape tablet touch support, and realistic phone viewing guidance.

## Accessibility & Inclusion

Support policy includes Windows and Linux desktops and Android tablets. Apple
guidance is provisional; the support page records the physical-validation limits.
Keyboard support does not establish that every match action is operable without
a pointer. Keep input and device claims consistent with verified behavior.

A formal accessibility conformance target and additional product-specific access
needs remain open decisions; this initialization does not claim certification.
