# Deployment save/load

Approved design: 2026-11-06. Implement in the existing checkout on
`feature/deployment-formations`; do not stage, commit, push, publish, or merge.

## Abstract

Manual acceptance revision, 2026-11-06: align the saved-formation panel bottom
with the chat/game-log bottoms and move Confirm with it, preserving spacing.
Narrow phone layouts retain a stack below the history panels. Use the coach's
saved `7-2-2 Offense`, `Anchor Defense`, and corrected `Chevron Defense` as the
approved definitions. Install them on all existing dev-local saved teams and
include both additions in the editable starter library for new teams. The
corrected Chevron leaves depth 1 empty, with staggered rows at depths 2 and 3.

Coaches need reusable, named deployments attached to saved teams to avoid
manually arranging every drive. Provide a formation editor in the team builder
and selection during ordinary drive setup.

## Objective and scope

Persist up to three offensive and three defensive formations per saved team.
Support creation, viewing, editing, naming, deletion, and Make default. Use
numbered circular chits, a clear 15-column by 13-row own half with two opposing
rows, wide zones, end zone, and line of scrimmage. Support touch and mouse,
existing themes, Android, Windows, and Linux. The reference image illustrates
layout only; use jersey numbers rather than position letters.

Exclude gameplay rule changes, formation controls in special kickoff placement,
and unrelated static-site or gameplay UI changes.

## Functional requirements and acceptance criteria

- Store immutable assignments by jersey number (1–99), relative column (0–14),
  and depth (0–12, with depth 0 on the LoS). Translate to either team's half.
- Each template has exactly eleven unique number/square assignments, at least
  three on the LoS, and at most two in each four-column wide zone. Validate on
  the server and in the editor. Actual drive confirmation uses existing BB2025
  availability and legality rules, including short-handed teams.
- Names are trimmed, nonempty, at most 16 ordinary ASCII characters, with a
  sensible common-punctuation whitelist and no control/markup characters.
- Each role has at most three formations, in display/default order. Make default
  moves an entry first. Defaults occupy an ordinary slot and are editable and
  deletable; explicitly empty collections must never be regenerated.
- Existing and newly saved teams without formation metadata receive the two
  supplied starters. Map diagram values 1–11 to the first eleven players sorted
  by actual jersey number. After initialization retain those numbers, including
  after roster removal or renumbering. Distinguish absent metadata from an
  intentionally empty collection and preserve historical document compatibility.
- The editor opens in a dismissible dialog on the builder. Support dragging
  chits and touch/keyboard placement. Save Formation closes the dialog and
  updates the unsaved team draft. Save Team persists all edits. Closing without
  saving discards pending dialog edits. Display missing roster numbers distinctly
  but permit retained assignments to them.
- Human setup automatically applies the first formation for the receiving
  (offense) or kicking (defense) role. No formation for that role means all
  players start in reserves and the Saved Formations container is absent.
- Show equal-sized named buttons under Confirm, with a Saved Formations heading,
  during ordinary setup only. Loading returns deployed players to reserves and
  applies available numbered assignments; absent/ineligible players leave holes.
  It never confirms setup. The coach can adjust and separately confirm.
- AI chooses randomly from its appropriate saved formations each drive, then
  minimally adds/repositions available players to complete legal setup. With no
  formations it generates a legal setup using existing setup behavior.
- Freeze formation data with the roster when creating a match. Later saved-team
  edits affect future matches. Reconnect, recovery, and replay preserve actual
  positions and chosen AI results without rerunning automatic deployment.

## Starter diagrams

Rows start at the LoS; four-column wide zones flank seven central columns.
Hex A/B represent diagram players 10/11. Last row is the own end zone.

```text
5-4-2 Offense                 Chevron Defense
----|-------|----             ----|-------|----
XXXX|XA819BX|XXXX             XXXX|XX819XX|XXXX
XX24|XXXXXXX|53XX             XXAX|X6XXX7X|XBXX
XXXX|XXXXXXX|XXXX             XXX2|XX4X5XX|3XXX
XXXX|XXXXXXX|XXXX             XXXX|XXXXXXX|XXXX
XXXX|XXXXXXX|XXXX             XXXX|XXXXXXX|XXXX
XXXX|XXXXXXX|XXXX             XXXX|XXXXXXX|XXXX
XXXX|6XXXXX7|XXXX             XXXX|XXXXXXX|XXXX
XXXX|XXXXXXX|XXXX             XXXX|XXXXXXX|XXXX
XXXX|XXXXXXX|XXXX             XXXX|XXXXXXX|XXXX
XXXX|XXXXXXX|XXXX             XXXX|XXXXXXX|XXXX
XXXX|XXXXXXX|XXXX             XXXX|XXXXXXX|XXXX
XXXX|XXXXXXX|XXXX             XXXX|XXXXXXX|XXXX
GGGG|GGGGGGG|GGGG             GGGG|GGGGGGG|GGGG
```

## Work slices

1. Saved formation value contract, validation, defaults, legacy compatibility,
   serialization, and frozen match data. Independently verifiable Java and
   browser protocol tests.
2. Builder dialog and management, draft save/discard semantics, touch/mouse/
   keyboard placement, and theme/responsive browser coverage. Depends on 1.
3. Runtime loading, automatic setup, AI completion, setup buttons, and recovery/
   replay coverage. Depends on 1; full acceptance depends on 2 and 3.

- Data/defaults: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/465
- Builder editor: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/466
  (blocked by #465).
- Live setup/AI/recovery: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/467
  (blocked by #465).

## Validation

Run focused Java and browser tests for the changed contracts and behavior, then
required Java reactor, game-service, browser unit/build and full dev-local browser
preflight. Add browser inventory entries for new UI suites. Verify live setup,
short-handed and unavailable players, role/orientation, AI, recovery/replay,
theme and mobile interactions. Self-review against every criterion. Start and
leave the supported dev-local stack ready at http://localhost:5000/play.
Record exact checks, review fixes, remaining gaps, issues, and local URLs in
`deployment-formations-outcome.md`. Add Unreleased changelog entry; do not add
to `site/updates.json` before merge.

## Affected checks

- Java: TeamFormationsTest, BrowserSavedTeamJsonTest, SavedFormationSessionTest,
  DefaultSetupSessionTest, SetupApplicationJournalTest,
  SetupApplicationCheckpointTest; full clean reactor install; standalone
  game-service clean verify.
- Browser: team-formations.test.ts, saved-team-protocol.test.ts,
  setup-protocol.test.ts; all browser unit tests and production build;
  formation-ui.mjs; site/test/builder-browser.test.mjs; complete supported
  dev-local hosted/interaction preflight.
- AI: computer-player full suite, including saved-formations.test.mjs.

## Self-review

The standards axis found no documented-standard breaches. Addressed its three
maintainability suggestions: shared approved starter fixture checked by Java and
TypeScript, shared saved-formation button rendering, and the clearer FormationSet
value name. Acceptance review found a missing live control projection, a
self-drop chit duplication, and an avoidable AI LoS reposition. Added the
projection and fixed both behaviors with native, unit, and browser regressions.
