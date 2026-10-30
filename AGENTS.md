# Agent Guidelines

## Delivery Workflow
- For implementation handoffs or requests to roll changes into `main`, read [the delivery workflow](docs/agents/feature-workflow.md). It defines the "normal process" / "usual method": GitHub issues for each slice, a new working branch, implementation, self-review, validation, and a results report. Publishing and merging require explicit authorization as described there.

## Team Sprite Artwork
- For creating, extending, revising, resizing, or reviewing team player sprites, read and use `.agents/skills/team-pixel-sprites/SKILL.md` and its referenced `.notes/art-preview/team-sprite-standard.md`. This applies even when the request does not explicitly name the skill. Keep unrelated art, typography, and gameplay tasks outside this workflow.

## Build Commands
- Build project: `mvn clean install`
- Run tests: `mvn test`
- Run single test: `mvn test -Dtest=TestClassName#testMethodName`
- Skip tests: `mvn install -DskipTests`

## Code Style
- Java version: all Java modules compile for release 21 and require JDK 21 or newer. Use `tools/bootstrap.ps1` and `tools/target-build.ps1` for the pinned, validated JDK/Maven setup.
- Encoding: UTF-8
- Testing: JUnit 5 with Mockito for mocking
- Package naming: `com.fumbbl.*` 
- Naming: Do not use legacy `f` or `p` prefixes for new fields or parameters.
- Project structure: Maven modules `ffb-common`, `ffb-tools`, `ffb-server`, and `ffb-statetest`; the browser application lives in `browser-client`, with canonical assets in `assets/game`. Browser V2 is the product runtime; V1 remains development-only diagnostics.
- Architecture hotspots: server game flow uses `Step` / `SequenceGenerator` classes under `ffb-server/src/main/java/com/fumbbl/ffb/server/step`; browser protocol and rendering live under `browser-client/src`, with product entry in `play-entry.tsx`.
- Ruleset-specific changes: when code used by multiple rulesets needs behavior changes for only one ruleset, create or move to a ruleset-specific package and update imports/annotations so unaffected rulesets keep the original behavior. `common` packages are shared by all rulesets; move shared `common` code to `mixed` before applying subset-specific behavior. `mixed` packages are shared by a subset; if modified behavior applies to only one ruleset, move the relevant class to that ruleset package instead. Never use inheritance between ruleset classes (e.g. a `bb2025` class extending a `bb2020`/`mixed` class); duplicate the class into each ruleset package and keep each ruleset's logic self-contained instead.
- Error handling: Use appropriate exception types, document exceptions in method signatures
- Services: Prefer instantiable service classes with instance methods over static utility classes/methods; create a service instance at the call site instead of calling static methods.
- Change list entries: Record user-visible changes under Unreleased in `CHANGELOG.md`. The public `site/updates.json` records actual merged PRs; add entries there only after merge.
- Test style: Test class names end with "Test", use descriptive test method names

### Import Organization
1. Project imports first (com.fumbbl.*)
2. Core Java imports after project imports (javax.*, java.*, etc.)
3. Within project imports, organize by package hierarchy
4. No wildcard imports (*) - list each class explicitly
5. Each import on its own line, no concatenation
6. Use blank lines to separate import groups

## Dependencies
Shared versions managed via root `pom.xml` include `classgraph`, JUnit 5, and Mockito. Module-specific dependencies may declare versions in their own `pom.xml`. Browser dependencies and scripts live in `browser-client/package.json`.

## Build Order
1. ffb-common
2. ffb-tools
3. ffb-server
4. ffb-statetest

## Agent skills

### Feature specs and tickets

When drafting new feature specs or implementation tickets, including with `/to-spec` or `/to-tickets`, use [the feature template](docs/agents/feature-template.md). Replace placeholders with concrete requirements and tailor constraints and validation to the feature and repository.

### Issue tracker

Issues and specs are tracked as GitHub issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain-documentation layout. See `docs/agents/domain.md`.
