# Deployment save/load outcome

Date: 2026-11-06. Branch: `feature/deployment-formations`.
Base: `35325153cb1aceeb5d24e9be2fcb319af4f384b0` (`main`).
Implementation and the final revision were manually accepted on 2026-11-06.
The user authorized staging, committing, a CI-gated PR merge, branch cleanup,
the completed-features entry, and dev-local shutdown. This report records the
pre-merge validation; GitHub and the completed-features tracker record delivery.
Publishing preflight registered `SavedFormationSessionTest` in the native CI
shard manifest and added the maintenance tests to the lifecycle CI job. The
manifest was checked against the completed clean-build execution reports.

Status: implementation, self-review, local automated validation, and manual
acceptance complete. Dev-local startup was verified with healthy services and
renewed Google Application Default Credentials. Runtime observations below
describe that validation session.

## Manual acceptance revision

The coach confirmed the original functionality and requested lower setup controls,
two added starters, and a corrected Chevron. The approved additions were read
from the coach's stored local team: `7-2-2 Offense` and `Anchor Defense`. Chevron
now leaves depth 1 empty, with its staggered rows at depths 2 and 3. Both browser
and Java starter libraries share the updated four-formation golden fixture.

The formation box bottom now aligns with both history-panel bottoms on desktop
and landscape. Confirm moves with it and retains the original 29-pixel gap.
Phone layouts keep the controls below the stacked history panels. A new geometry
assertion failed before the change (798 versus 884 at 1440 pixels) and passes
afterward, including the unchanged spacing and phone non-overlap assertions.

All 29 dev-local saved teams were updated through
`tools/dev-local-install-formations.mjs --apply`. The tool backed up complete
documents under ignored `.tools/formation-backups/`, applied one transaction with
version/hash guards, and verified every resulting document. Only formation data
and document versions changed. The one coach-authored source team retained its
other saved choices and ordering. A real database failure check proved that a
stale second row rolls back the first update and leaves all documents byte-identical.
A repeated migration reports zero updates. Existing frozen matches remain intact.

The maintenance command is dry-run by default and restricted to the isolated
dev-local Docker database. It refuses overflowing role groups. New teams receive
all four starters; explicit subsequent deletions remain respected. Four focused
maintenance tests, the formation UI suite, and all 500 browser unit tests pass.
The clean Java reactor install passed again: 973 discovered, 961 passed, 12 existing
opt-in skips, zero failures/errors. The AI LoS repair regression now pins Chevron
explicitly because the starter library offers multiple defensive choices. A clean
build also removed stale compiled test output found by the initial focused run.
The required dev-local preflight passed all 77 suites again, with no failures or
skips: 67 interaction suites and 10 hosted suites. Fresh reports are under
`.tools/validation/local-browser-SOXyaW/`. The normal dev-local lifecycle command
then rebuilt the Linux server image, passed the live proxy check, and restarted
the local services successfully. `/play`, `/teambuilder`, and the served game CSS
return HTTP 200; the CSS includes the revised alignment rule. Both containers
are healthy, mounted ADC passes, and the AI daemon is ready with empty stderr
and zero error lines. A post-restart migration preview confirms all 29 stored
teams are current, with zero remaining updates. Dev-local remains running.

Revision logs: `.notes/deployment-formations-revision-java-clean.log`,
`.notes/deployment-formations-revision-units.log`,
`.notes/deployment-formations-revision-ui.log`,
`.notes/deployment-formations-revision-migration.log`, and
`.notes/deployment-formations-revision-dev-local.log`.

## Delivery and acceptance

Approved source: [deployment-formations.md](deployment-formations.md), including
all twelve clarification decisions from the review conversation.

| Slice | Tracker | Implemented result |
| --- | --- | --- |
| Saved data and defaults | [#465](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/465) | Validated immutable jersey-based templates, six-slot limits, four supplied starters, backward-compatible JSON, preserved explicit deletion, private frozen match data. |
| Builder management | [#466](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/466) | Dismissible editor, names, numbered chits, mouse drag, touch and keyboard placement, missing-number styling, create/edit/delete/Make default, draft save/discard and team persistence. |
| Live setup and AI | [#467](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/467) | Role defaults, equal-sized buttons below Confirm, atomic replacement with unavailable holes, empty human setup, random AI selection with legal completion, recovery and replay preservation. |

All original functional requirements are covered by these slices. Formation
templates require eleven distinct assignments, at least three on the LoS, and
at most two in each wide zone. Drive confirmation continues to use the engine's
BB2025 legality checks for the actual available players. Selection never confirms.
Formation controls are confined to ordinary drive setup.

The diagram's 1–11 values map to actual jerseys in ascending order. Subsequent
roster edits do not remap references. Existing named teams gain starters lazily
when projected or frozen for a new match, with persistence on the next team save;
reads do not rewrite historical document versions. Older updates omitting the
extension preserve prior assignments and explicit empty groups. Existing match
snapshots lacking formation metadata retain their historical setup behavior.

Team-builder dialog changes remain staged until Save Formation; that closes the
dialog and updates the draft. Validate Roster and Save Team persist the draft.
Closing without saving discards dialog changes. Later saved-team edits do not
alter an ongoing match. AI formation choice is deterministic from the match and
drive identity, providing a random choice per drive that is stable during journal
replay and recovery.

## Standards

No documented-standard violations. Addressed three review suggestions:
shared golden starter fixture checked by Java and TypeScript, shared formation
button rendering, and a clearer `FormationSet` value name.

## Spec

Fixed the missing server projection of live buttons, same-square chit duplication,
and unnecessary AI LoS repositioning. Added native, unit, and real browser
regressions; follow-up review approved. Final self-review also fixed a drag
suppression flag that could ignore the next click. Its real browser regression
failed before the fix and passes afterward.

Native checks caught away-side orientation: template columns rotate with the
coach view, while native setup commands otherwise mirror only the x axis. Both
coach perspectives now have explicit coordinate assertions.

Review totals: standards: zero hard violations and three addressed suggestions;
spec: three reported defects resolved, plus orientation, drag follow-up, and published-stylesheet
fixes found during validation.

The published builder initially lacked the new standalone stylesheet, which Vite
injected in development. A hosted regression reproduced `display: block` instead
of the required pitch grid. The site build now copies the canonical editor CSS,
and only the team-builder page links it. The regression passes with `display:
grid`; desktop/phone captures show the public MUTP theme. The local Hosting
artifact was rebuilt, and a final full browser refresh passed all 77 suites.

## Validation evidence

Clean reactor install passed: 973 discovered tests, 961 passed, zero failures/errors, and 12 opt-in integration/fixture skips. The standalone game-service clean verify passed all 29 tests. Both the supported serial startup gate and the final full refresh passed all 77 suites. The final refresh includes the published-builder stylesheet regression and all final product changes.

Checks already completed:

- Browser production build, public-site build, and final local-dev Hosting assembly.
- Full final browser coverage: 67 interaction suites and 10 hosted suites passed,
  with no failures or skips. Reports: `.tools/validation/local-browser-H8B9nx/`.
  The tooling records the current HEAD SHA; it tests the uncommitted working files.
- 500 browser unit tests, including strict formation and setup protocol checks.
- 50 computer-player tests, including both policies retaining the server-deployed
  saved formation.
- 29 standalone game-service tests and `clean verify` packaging.
- Public-site check and 12 unit tests.
- Focused Java formation/default, saved-team, native setup, checkpoint, and
  journal tests; added a legacy-update preservation regression.
- Formation UI: mouse drag, touch placement, keyboard placement, self-selection,
  invalid counts, naming, missing numbers, all six slots, Make default, save and
  discard, deletion without regeneration, pending controls, and responsive setup
  buttons. Public hosted builder also verifies Save Formation does not persist
  before Save Team.

Key logs in this checkout:

- `.notes/deployment-formations-clean-install.log`
- `.notes/deployment-formations-compatibility.log`
- `.notes/deployment-formations-final-focused.log`
- `.notes/deployment-formations-final-browser-units.log`
- `.notes/deployment-formations-ai-full.log`
- `.notes/deployment-formations-game-service.log`
- `.notes/deployment-formations-ui.log`
- `.notes/deployment-formations-builder-hosted.log`
- `.notes/deployment-formations-dev-local-serial.log`
- `.notes/deployment-formations-browser-final.log`
- `.notes/deployment-formations-builder-final.log`
- `.notes/deployment-formations-hosting-final.log`
- `.notes/deployment-formations-final-compile.log`
- `.notes/deployment-formations-startup-resumed.log`

Visual captures: [public desktop editor](deployment-formations-evidence/editor-public-desktop.png),
[public phone editor](deployment-formations-evidence/editor-public-mobile.png),
[phone pitch and reserves](deployment-formations-evidence/editor-mobile.png),
[desktop setup](deployment-formations-evidence/setup-1440.png),
[phone setup](deployment-formations-evidence/setup-390.png), and
[landscape setup](deployment-formations-evidence/setup-844.png).

The initial four-worker startup preflight stopped at a timeout in the existing
double-click confirmation suite. Its 400 ms gesture checks passed in isolation;
the two-worker retry passed that suite but timed out navigating in the existing threat suite. The supported serial preflight was selected after the clean Java build finished. Both failing suites passed isolated checks.
No confirmation behavior was changed to accommodate that failure.

## Dev-local readiness

The latest revision completed through the normal
`node tools/deploy.mjs --environment dev-local` workflow with one browser worker.
Its fresh 77-suite reports, Linux server build, live proxy test, and final
readiness checks are recorded in the manual acceptance revision above.

During the initial startup, the workflow built Hosting and the Linux server image, then stopped at
expired Google Application Default Credentials. The user completed sign-in with
the supplied custom OAuth client. The standard and mounted credentials now pass
the Firebase ADC check.

That initial startup resumed at the interrupted stage using the existing repository lifecycle
helpers. Before resuming, the continuation verified all five final browser reports,
the complete 77-suite manifest, and that no product files had changed since those
reports. It then refreshed the mounted credentials, restarted and checked the game
server, and started the proxy, Hosting, and computer-player daemon. The managed
dev-local state was written so the normal lifecycle commands can stop or restart
this instance. No permanent lifecycle-tool changes were needed.

Verified readiness:

- `Dev-local ready: http://localhost:5000/play`.
- HTTP 200 for `/play`, `/teambuilder`, and `/assets/formation-manager.css`;
  the served stylesheet contains the pitch grid rules.
- Isolated database and game server containers are healthy; mounted Firebase ADC
  reports `OK`.
- The live proxy test reached the real Java authentication gate on both initial
  connection and reconnect through port 22232.
- The computer-player daemon reports ready, with zero error lines and empty
  active stderr.

The local instance remains running for the requested manual validation. No files
were staged or committed, and nothing was pushed, opened as a PR, merged, or
published remotely. All three issues remain open with `ready-for-human` labels.

## Manual validation

Use [Team Builder](http://localhost:5000/teambuilder) and
[Play](http://localhost:5000/play).

1. Load a saved team and open Manage formations. Check all four starters, rename or
   move a number, save the formation, then validate and save the team.
2. Create another formation in either group and use Make default. Reload the
   team and verify the chosen default and order persist.
3. Start a new match. Check the correct receiving/kicking default and the buttons
   below Confirm. Manually move players, select a formation, then confirm.
4. Edit or remove a referenced roster number and verify its marked assignment
   remains in the editor. In a later drive, unavailable players leave holes for
   the human coach to repair.
5. Delete all formations for a role and save. A new human setup for that role
   starts in reserves with no formation box; AI still completes a legal setup.
6. Reconnect during setup after manual changes. Positions should remain where
   they were, with no automatic reapplication.

Physical Android and Linux browser checks were not available in this Windows
session. Touch/mobile checks use Chromium emulation. The 12 Java skips are the existing opt-in checks in BrowserSchemaMariaDbTest,
Marker6SchemaTest, SkillUsePreferenceSchemaIntegrationTest,
RecoveryJournalMariaDbTest, V2PreparationJdbcTest,
R5CompletedFixtureGeneratorTest, R5RestoredContinuationTest,
RecoveryApplicationTest (two), RecoveryArtifactInspectionTest, and
V2RuntimeIntegrationTest (two). Those external database/retained-fixture scenarios
were not exercised by the normal reactor command.

## Workflow retrospective

The repository's retrospective and writing-for-agents guidance were consulted.
The useful environment follow-ups are to use `npm.cmd` and process-scoped
PowerShell execution-policy bypass on this host, use the documented Windows-user
credential route for authenticated GitHub CLI operations, and reduce browser
workers when timing-sensitive gesture suites contend with broad native checks.
An initial Java compiler failure left stale class output; a clean reactor build
restored a reliable feedback loop. No agent instructions or machine settings
were changed.
