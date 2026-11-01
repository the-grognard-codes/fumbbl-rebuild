# Feature: Supported hardware and minimum system requirements review and update

Tracking issue: [#388 Supported hardware and minimum system requirements](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388). Published with `ready-for-agent`; this document is the local design mirror. The staged approval checkpoints below remain in effect.

## Abstract

Establish evidence-based 2026 hardware, browser and display requirements for Moles Under the Pitch (MUTP), implement individually approved compatibility changes, and explain the requirements and validation limits on the public support page.

## Objective

Support the broad majority of existing and prospective players in North America, the United Kingdom and European Union across desktop/laptop, phone and tablet systems, with reasonable hardware, browser and usable-display boundaries. Include mainstream systems from the last several years and suitable midrange devices. Do not retain very old platforms or cramped match layouts at the expense of UI/UX and graphics development. Separate website access from comfortable full-match play. The owner's clarification supersedes the earlier approximate 99% aspiration: no numeric coverage percentage is an acceptance gate.

This is a parent specification with staged decision checkpoints. Specification publication does not authorize implementation or automatically approve numeric minimums, support exclusions, or every candidate change.

## Problem Statement

Players do not have a clear statement of which devices and browsers can run the website and complete a match comfortably. Layout work currently accommodates extremely small viewports without an evidence-based support floor, creating compromises in readability and control placement. High physical display resolution alone does not establish a usable match viewport.

The project needs an explicit balance between broad practical access and the cost of accommodating obsolete platforms. A usable support policy needs transparent research, observable playability criteria, and an honest account of testing coverage; proving a population percentage is not required to select sensible boundaries.

## Solution

Publish a desktop-first coaching policy with landscape tablet play and phone website/replay/spectating support. Recommend phone viewing rather than direct coaching; phone coaching remains best effort. Publish resolution/scaling guidance and tested examples, not arbitrary display eligibility thresholds. Only measured absolute layout-fit minima may become technical display limits; fitting all elements without unintended overlap does not establish a usable playing experience. Preserve best-effort continuation and accessible recovery controls.

Use regional research and local testing to propose the policy, then obtain case-by-case approval for consequential choices and concrete compatibility changes. Validate approved work using the existing hosted product and match lifecycle test boundaries. Maintain a public support-page summary and a detailed engineering evidence record.

## Context / Existing Behavior

- Browser V2 is the product runtime. Browser V1 is development-only diagnostic tooling; retired Java desktop clients do not define player requirements.
- No formal comprehensive device/browser/OS support matrix surfaced in the repository review.
- Existing hosted match CSS includes narrow/short viewport accommodations. Regression tests include 375x300, 640x330 and larger viewports; these tests are not themselves a support promise.
- The chat/log sizing outcome explicitly deferred Debug overlap at 375x300 CSS pixels and expanded tracker/dugout crowding at 640x330 to minimum-display work.
- Live pitch sizing already uses ResizeObserver and DOM/SVG rendering; input already uses Pointer Events and pointer capture, with coarse-pointer adaptations in menus.
- Product connection status and reconnect controls exist. A shared below-minimum viewport warning was not found.
- Current browser validation primarily uses Chromium; cited prior layout results used Windows Chrome/Chromium and touch emulation. Those results do not establish Android, Linux or Apple device validation.
- Inspected application code did not reveal device/browser/viewport analytics collection. Availability and suitability of existing infrastructure metadata remain unknown.
- Windows and Android Studio are available for local work. Preliminary inspection found Android system images and usable WHPX emulator acceleration; no emulator was booted or application compatibility test run during specification preparation.
- The owner does not have an iPad or Mac and does not expect to obtain either. Apple hardware acquisition is not a prerequisite for this project.

## In Scope

- Dated regional device/browser/OS research and evidence quality assessment.
- Separate support policies for public/account/team-management pages, live play, spectating, match replay and recovery.
- Windows, Linux, macOS, Android, iOS and iPadOS compatibility targets.
- Evidence-backed CSS layout-fit minima, desktop-first and landscape tablet coaching, phone viewing, scaling guidance, and measurable usability/performance criteria.
- Individually approved changes to viewport guidance, responsive layouts, input compatibility and browser capability handling.
- Cross-browser local automation, Android phone/tablet emulator validation and accurate reporting of unavailable hardware evidence.
- All existing MUTP themes, typography, colors and styling.
- Support-page requirements, testing-confidence disclosure, research references and maintenance guidance.

## User Stories

1. As a prospective player, I want to know whether my current device can use MUTP, so that I can decide whether to start playing.
2. As an existing player, I want commonly used older devices considered, so that support is not limited to recent flagships.
3. As a player using a budget or midrange phone, I want requirements based on actual capabilities, so that a marketing category does not exclude me.
4. As a player in North America, the UK or EU, I want the support policy informed by devices used in my region, so that its coverage estimate is relevant.
5. As a website visitor, I want to read information and access account functions on small screens, so that match requirements do not unnecessarily restrict the rest of the site.
6. As a coach, I want to manage a team draft and saved team on my supported device, so that I can prepare for a match.
7. As a phone user, I want the website, replay and live spectating supported, with clear guidance that direct coaching is best effort, so that I can choose a suitable interaction.
8. As a coach using a tablet, I want adequate controls and readable information in landscape, so that full-match play is practical.
9. As a desktop coach, I want requirements expressed in usable browser space, so that window size and display scaling are accounted for.
10. As a player with a high-density screen, I want resolution terminology explained, so that physical pixels are not confused with usable layout space.
11. As a coach, I want to select players and canonical pitch squares accurately, so that display adaptations do not change my intended action.
12. As a coach, I want prompts, dice choices, confirmations and turn controls to remain reachable, so that I can complete every required decision.
13. As a touch user, I want essential actions to work without hover, so that I do not need a mouse.
14. As a keyboard user, I want existing navigation and focus behavior preserved, so that compatibility work does not remove working controls.
15. As a coach who rotates or resizes a device, I want layout guidance to update without losing state, so that play can continue safely.
16. As a coach using chat, I want the virtual keyboard and browser controls accounted for, so that input does not leave essential actions inaccessible.
17. As a player whose viewport cannot fit the interface, I want clear support guidance and best-effort continuation, so that I understand the limitation without an unnecessary lockout.
18. As a reconnecting coach, I want recovery controls accessible despite a small viewport, so that I can return to my match.
19. As a coach with a pending action, I want resize and orientation changes to preserve exact retry behavior, so that commands are not duplicated or discarded.
20. As a spectator, I want the support page to explain viewing requirements, so that I know whether my device can follow a match.
21. As a replay viewer, I want playback and inspection controls to work within the declared support range, so that I can review completed matches.
22. As an Apple-device user, I want compatibility pursued and testing limitations stated, so that intended support is not confused with physical-device verification.
23. As a player selecting a theme, I want the existing MUTP appearance preserved, so that device compatibility does not change the visual identity.
24. As a player, I want minimum and recommended requirements distinguished, so that basic compatibility is not mistaken for a measured performance guarantee.
25. As a maintainer, I want tests at the support boundary and below it, so that future changes preserve both supported and promised best-effort behavior.
26. As a maintainer without Apple hardware, I want useful local WebKit checks, so that compatibility work can proceed without claiming actual Safari validation.
27. As a maintainer, I want repeatable local Android phone/tablet checks, so that browser emulation can be supplemented with an Android operating-system environment.
28. As the project owner, I want research-backed choices and code changes presented individually, so that I retain control over exclusions and compatibility tradeoffs.
29. As the project owner, I want approved stages executable sequentially without repeated routine questions, so that implementation can proceed unattended within agreed boundaries.
30. As a player seeking help, I want requirements, known limits, testing methods and a last-reviewed date on the support page, so that I can understand my system's support status.

## Functional Requirements

1. Produce a dated evidence report distinguishing people, devices, installed base and page-view statistics. Record geography, collection period, methodology, uncertainty and sources. Any optional numerical coverage estimate must not combine unrelated marginal statistics as if they measured joint player coverage.
2. Use regional evidence and observable playability to prioritize the broad majority of potential users while setting explicit lower boundaries. Prefer maintained browsers and reasonably current OS/hardware capabilities. Do not prolong obsolete-platform support or compromise core UI/UX and graphics options merely to chase a percentage. Exact audience weights, model-popularity estimates and proof of 99% coverage are not prerequisites for policy approval.
3. Define separate support matrices for website functions and match activities. Each matrix identifies OS/browser policy, input methods, usable viewport requirements, intended support and evidence status.
4. Use 1920×1080 fullscreen and approximately 1920×945 maximized CSS pixels as desktop review references, not minimums. Include scaled laptops and 4:3, 3:2 and 16:10 landscape tablets. Consider browser chrome, scaling, zoom, orientation, split-screen and temporary keyboard obstruction. Publish an absolute layout minimum only after role-specific measurement demonstrates that relevant visible elements fit without unintended overlap or clipping; distinguish fit from comfortable use.
5. Live coaching is desktop-first with landscape tablet support. Phone website/account/team management, replay and spectating are supported targets; recommend viewing over direct coaching. Phone coaching remains best effort, with no dedicated compact-play guarantee. Do not block by device category or remove narrow rules needed by viewing, zoom or recovery.
6. Measure minimum-device suitability through externally observable essential tasks and declared responsiveness criteria. Do not invent CPU/RAM/GPU minimums or use emulator timings as physical-device performance evidence.
7. Assess any measured below-minimum condition through available space and relevant capabilities. Provide understandable public guidance; any in-app warning is separately reviewable and must reassess on resize/orientation changes. Avoid device-model allowlists and hard blocking unless a separately reviewed failure makes it necessary.
8. Preserve connection status, recovery access, pending decisions, command identities, match checkpoints and transcript semantics during all layout/guidance changes.
9. Inventory small-screen rules before removal. Retain useful best-effort accommodations and rules needed during temporary viewport reductions.
10. Resolve the two documented tiny-viewport exceptions against the approved support policy. Fix supported-range failures; document explicit below-minimum behavior rather than simply deleting assertions.
11. Make layout, touch/input, browser-target or fallback changes only for approved, evidenced compatibility gaps. Preserve all themes, colors, typography, camera behavior and canonical pitch targeting.
12. Keep the support page synchronized with the implemented policy. Explain experience roles, resolution/scaling recommendations, physical versus CSS pixels, any measured absolute fit minima, known limits, validation confidence and review date. Recommend starting at 100% browser zoom while keeping OS scaling comfortable; do not require 100% OS scaling, zooming out, or fullscreen. Add browser/OS and hardware requirements only when separately approved. Do not invent a numeric minimum or imply that phone viewing has already passed device acceptance.
13. Distinguish evidence categories: native browser on named OS, Android emulator, browser/device-profile emulation, WebKit engine compatibility, physical-device validation, and unverified combinations. Do not call WebKit on Windows actual iPad/macOS Safari testing.
14. Local-only delivery is permitted with Apple physical-device coverage explicitly unverified. Missing Apple hardware does not authorize dropping Apple compatibility targets, declaring them verified, or making unsupported coverage claims.
15. No new telemetry, paid testing service or hardware purchase is assumed. Any such proposal needs separate scope and authorization.

## Acceptance Criteria

- [x] A dated regional report covers desktop/laptop, phone and tablet categories and documents representative older and non-flagship hardware. Model-level installed-base popularity remains unverified and is not an approval gate under the clarified objective.
- [x] The report explains denominators, uncertainty and limits of population claims. Approximate 99% coverage is no longer a target that must be demonstrated.
- [ ] The approved policy explicitly identifies supported, best-effort and unsupported environments and permits UI/UX and graphics progress without obsolete-platform workarounds.
- [x] The owner approved desktop-first coaching, landscape tablet coaching, phone website/replay/spectating support, best-effort phone coaching, and display recommendations rather than arbitrary numeric cutoffs.
- [ ] Absolute role-specific layout-fit minima have evidence before publication; remaining browser/OS policy and performance criteria are approved before governing implementation.
- [x] Proposed code changes are classified as required, conditional, optional or unnecessary in the code change assessment.
- [ ] Case-by-case implementation decisions are recorded before each product change proceeds.
- [ ] Supported match configurations allow essential player/square selection, required choices, confirmation and turn completion; controls remain readable and reachable.
- [ ] Public desktop/tablet/phone guidance reflects the approved roles. Any separately approved runtime fit warning behaves correctly on load, resize and rotation, with best-effort continuation and recovery access; reference sizes alone never trigger an unsupported-device warning.
- [ ] The 375x300 Debug and 640x330 tracker/dugout exceptions have explicit, justified dispositions and matching regression expectations.
- [ ] All existing themes preserve MUTP styling across the tested matrix; unavailable combinations have explicit evidence gaps.
- [ ] Fresh live play, spectator viewing, completed match replay, reconnect, pending-action recovery and supported server restart recovery retain their existing semantics.
- [ ] Local Chromium/Chrome/Edge, Firefox and WebKit checks run for the selected scenarios; Android phone/tablet emulator checks run after setup. Environment blockers are reported, not recorded as passes.
- [ ] Linux validation uses an actual Linux browser environment when available; Windows results are not relabeled Linux results. Unavailable Linux coverage is reported explicitly.
- [ ] Actual Safari/iPad/macOS hardware validation remains explicitly unverified unless separate evidence is obtained. This absence is documented rather than an automatic blocker to local delivery.
- [ ] The public support page reflects implemented behavior and evidence status, includes a last-reviewed date and research links, and does not publish unsupported coverage or performance claims.
- [ ] Focused regressions and required browser unit/build/integration and Java/game-server checks pass, or concrete blockers and unverified acceptance items are recorded.
- [ ] The final outcome maps every approved requirement to evidence and lists remaining limitations; unresolved criteria are not marked complete.

## Constraints

- Preserve game mechanics, rules, sequencing, authorization and durable acceptance/recovery contracts.
- Preserve the accepted coach view, top-down view, canonical pitch identities, keyboard/text-companion access and reduced-motion behavior.
- Preserve existing themes and MUTP colors, typography and style; reuse existing scaffolding.
- Follow repository conventions and retain the Browser V2 product / Browser V1 diagnostic distinction.
- Create a new working branch before implementation; preserve unrelated working-tree changes.
- Do not stage, commit, push, create a PR, merge or deploy without explicit authorization.
- Current authorization covers specification creation, local mirroring, issue publication, unattended research/baseline investigation and policy updates. The experience/display policy is approved as recorded above; remaining OS/browser/hardware proposals and concrete implementation changes remain subject to the owner's case-by-case review instruction.
- No requirement to purchase or obtain an iPad or Mac. No paid remote-device testing, new analytics, or account/credential changes are authorized by this spec.

## Implementation Decisions

- Share measured fit constants only if runtime guidance, validation fixtures and public documentation actually need them. No runtime policy module or threshold constants are needed solely to publish recommended display settings.
- Reuse the hosted product entry, current match layout and input handling rather than replacing the renderer or interaction architecture.
- Prefer capability/available-space checks over user-agent or device-name exclusions.
- Keep support guidance local to presentation. It must not change legal actions, command IDs, authoritative match state, checkpoints or transcript records.
- Preserve the existing support page and navigation; add readable player-facing requirements there. Keep detailed engineering execution logs in the linked evidence record rather than exposing implementation internals in normal player flows.
- Record intended support separately from validation confidence. Apple compatibility remains a target, with local WebKit/mobile-profile evidence accurately labeled.
- No database schema or gameplay API contract change is expected. Any discovered need is a separate proposal.
- Respect the accepted coach-oriented pitch and durable recovery decisions. Renderer migration, camera redesign and recovery redesign are not implicit compatibility fixes.
- Reuse existing performance evidence and measurement work where applicable; do not duplicate or silently relax the separate smooth-gameplay workstream's physical-device acceptance obligations.

## Implementation Guidance

Execute in dependency order, retaining independently reviewable deliverables:

| Stage | Deliverable | Depends on | Execution boundary |
| --- | --- | --- | --- |
| A. Evidence and inventory | Regional research, current support assumptions, browser capabilities, existing CSS/test inventory and local test readiness | None after execution authorization | May run unattended within approved read-only/local scope |
| B. Proposed policy | Website/match matrices, candidate thresholds, browser/OS floors, hardware/performance criteria and explicit exclusions | A | Owner approves consequential policy choices; no percentage-coverage gate |
| C. Change register | Individual warning, layout, CSS-removal, input, browser-target and deferred-exception proposals; each has evidence, scope and verification | B | Owner accepts, rejects or defers each proposal |
| D. Approved implementation | Each accepted change includes runtime behavior, meaningful regressions and corresponding support-page updates | Relevant B/C approvals | May run sequentially unattended within approved scope |
| E. Integrated validation | Local browser engines, Android emulator, available Linux checks, theme and lifecycle evidence, required builds | D | Repair scoped failures; escalate genuine blockers or changed scope |
| F. Handoff | Reconciled support page, evidence/outcome report and exact remaining gaps | E | Leave uncommitted for review; publication/deployment separately authorized |

The owner asked whether unattended execution is possible; that question is not itself a blanket authorization to choose all unresolved policy values. Research and approved implementation stages can proceed without repeated routine approval. The retained case-by-case instruction creates two substantive checkpoints: support-policy selection and approval of the concrete change register. These may be consolidated into one review when evidence is complete.

An agent encountering a blocker should preserve completed evidence, continue unaffected authorized work, and report the precise dependency. Lack of Apple hardware is a known validation limitation, not a reason to repeatedly request hardware or stop unrelated work.

## Testing Decisions

Use the existing hosted website/Browser V2 boundary as the primary acceptance seam, exercising what players see and can do. This retains the test boundaries in the plan approved by the owner. Reuse existing real-server lifecycle tests for authoritative integration rather than introducing a parallel mock protocol. Focused unit tests are appropriate only for meaningful threshold, geometry or state-transition edge cases.

Good tests assert external behavior: essential controls reachable, correct canonical square selected, orientation guidance updated, recovery controls accessible, no duplicate action, and preserved replay behavior. Avoid asserting private implementation structure or recreating calculations in test code.

Prior art includes current HUD and confirmation-position checks, tracker/dugout/chat layout tests, hosted public-page flows, reconnect and pending-recovery suites, real-server live/replay checks and the existing browser suite manifest.

Boundary coverage includes measured layout-fit minima and just-above/just-below values once established; desktop/scaled-laptop and landscape-tablet coaching; phone website/replay/spectating; both coach orientations and pitch views; all themes; pointer, touch and keyboard; rotation/resize, browser zoom, virtual keyboard, and reduced motion. Retain meaningful small-viewport recovery/viewing regressions even where phone coaching is not promised. A spectate listing-page test is not acceptance for the live viewer.

## Validation

- Run narrow affected selectors before broader required suites. Record exact commands, versions, settings, results, skips and artifact locations.
- Run browser unit tests, production product and relevant site builds, registered browser integration suites, and required Java/game-server builds/tests through supported project tooling after code changes.
- Use local Windows browsers for native Windows checks. Install/use selected Playwright Chromium, Firefox and WebKit engines as needed in authorized execution; device profiles simulate viewport/input characteristics, not complete physical devices.
- Use Android Studio phone and tablet emulators with recorded Android image, browser version, viewport/density, orientation and keyboard settings. Check boot, browser availability, host access, authentication and WebSocket connectivity before acceptance runs.
- Connect emulators to the supported local stack through emulator host networking or a controlled local forwarding arrangement. Preserve origin, authentication and transport security; do not disable production security checks for a test.
- Android emulation provides Android OS/browser behavior evidence. Host-driven CPU/GPU timings do not establish real low-end phone performance.
- Run Linux browser checks in an available local Linux/WSL/container environment where suitable, distinguishing headless engine evidence from interactive desktop evidence.
- Use local WebKit plus iPhone/iPad-style profiles for useful Apple compatibility checks. Actual Safari builds, Apple OS integration, mobile browser chrome, hardware performance and native-device behavior remain unverified without suitable external evidence.
- Paid device clouds or remote Apple hosts are optional separately approved follow-ups, not default prerequisites.
- Verify fresh live play, spectator flows, match replay, disconnect/rejoin, exact pending-action retry, and supported restart recovery before visual handoff.
- Investigate failing checks and repair scoped regressions; do not weaken assertions solely to make the suite pass. Report genuine environmental blockers and incomplete coverage.
- Emulator/browser setup readiness is not a passing application test.

## Out of Scope

- Game mechanics, rules or sequencing changes.
- General UI redesign, new artwork, typography changes, theme replacement or renderer migration.
- Restoring retired Java desktop clients or making diagnostic V1 the product.
- Broad dependency upgrades, polyfills or browser exclusions without a demonstrated and approved need.
- New telemetry collection, account setup, hardware purchases or paid testing services without separate authorization.
- Guaranteed physical-device performance based on emulation.
- Claims of actual iPad/macOS Safari validation from WebKit on Windows.
- Automatic removal of small-screen behavior or hard match-entry blocking.
- Commit, push, PR, merge or deployment as part of spec creation.

## Further Notes

The approved experience/display policy and remaining platform proposals are recorded in `docs/specs/supported-hardware-policy-proposal.md`; the file-level implementation assessment is in `docs/specs/supported-hardware-code-change-assessment.md`. Rounded working layout-fit references are now recorded in `docs/specs/supported-hardware-display-dimensions.md`; an exhaustive all-state minimum is not claimed. Browser/OS floors and performance limits remain subject to review. Exact regional weighting and numerical population coverage are not delivery gates. This parent is ready for authorized preparation; its label does not waive implementation checkpoints.

Official testing references checked during specification preparation:

- [Playwright browsers](https://playwright.dev/docs/browsers): supported browser engines and the distinction between patched WebKit and branded Safari.
- [Playwright emulation](https://playwright.dev/docs/emulation): device profiles simulate characteristics including viewport, user agent and touch.
- [Android Emulator acceleration](https://developer.android.com/studio/run/emulator-acceleration): Windows virtualization prerequisites.
- [Android Emulator networking](https://developer.android.com/studio/run/emulator-networking): emulator networking capabilities and local-host access guidance.

Existing smooth-gameplay work, including [#324](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/324), may supply relevant performance evidence. Its separately specified hardware acceptance is not superseded by this compatibility review.

## Completion Notes

Stage A research findings and bounded baseline investigation delivered on 2026-10-31, with the evidence gaps below. Research reports and reproducible evidence are prepared locally and remain uncommitted:

- Regional report: `docs/research/supported-hardware-2026-market-evidence.md`.
- Repository, representative hardware and local validation report: `docs/research/supported-hardware-2026-baseline.md`.
- Reproducible existing-GameView probe and archived JSON: `docs/research/supported-hardware-2026-probe.mjs` and `docs/research/supported-hardware-2026-baseline-evidence.json`.

The regional evidence distinguishes September 2026 page-view shares from UK/EU survey measures and explicitly labels Europe as a proxy rather than EU-27. It cannot substantiate numerical player coverage. The owner subsequently clarified that broad practical coverage with sensible limits takes precedence over the former approximate 99% aspiration. ChromeOS and Samsung Internet warrant scope review; concrete policy candidates are now documented separately for approval.

Six existing focused browser suites passed: confirmation placement, coach HUD, drive tracker, reconnect, pending recovery and chat. A separate synthetic single-action probe passed cleanly at all seven viewports in Chromium and Firefox. WebKit emitted the expected action at every size but reported ResizeObserver loop notifications at six sizes, failing the no-page-errors assertion; production cause and impact remain unestablished. This is not fresh real-server lifecycle or complete-match acceptance.

Android acceleration, SDK images and existing Pixel AVDs were verified. A temporary read-only, headless Pixel_9 instance launched, but ADB remained unauthorized; it was stopped without saving device changes. Ubuntu is present, with Linux browser/tool setup still required. Apple physical-device coverage remains unverified. No product code, public support-page content, security settings, commit or deployment changed.

Stage B updated after the owner's 2026-10-31 experience-policy approval. Detailed policy: `docs/specs/supported-hardware-policy-proposal.md`.

- Approved: desktop-first live coaching; landscape tablet coaching; phone website/replay/spectating as supported targets and recommended phone uses; direct phone coaching best effort.
- Approved: resolution/scaling recommendations, with 1080p at 100% scaling/zoom a desktop design reference rather than a requirement. Only measured absolute fit minima may become technical display limits; no such numbers are established yet. Supersedes the former 360px, 1024x600, 720x340 and alternative 800x360 floors.
- Pending browser proposal: current/previous stable Chrome, Edge and Firefox plus maintained Firefox ESR; current/previous annual Safari family; current Samsung Internet.
- Pending OS proposal: Windows 11; Android 13+; iOS/iPadOS 26+; macOS 15+; maintained 64-bit Linux; maintained ChromeOS.
- Pending hardware proposal: provisional 8 GB computer / 4 GB Android reference budgets, with 16 GB / 6 GB recommendations. No measured RAM minimum or model sniffing.
- Concrete changes remain individually reviewable in `docs/specs/supported-hardware-code-change-assessment.md`; no product implementation is authorized merely by approving the policy.

Historical research and probe dimensions remain evidence, not current policy. Phone viewing needs its own control/geometry acceptance; full phone coaching is no longer a guaranteed target.

Layout measurement follow-up completed on 2026-10-31: `docs/research/layout-minima-2026.md`, its evidence JSON, and the replay-specific report/probe record bounded geometry results. The archived live investigation includes 1591 geometry cases and 96 interaction checks, including a 729-case independent panel matrix at 1347x280. Four-resource live layouts pass 1097x600 and fail 1096x600; five-resource layouts pass 1347px and fail 1346px at the tested heights. Replay controls remain reachable on tested phone sizes, but supporting dugout buttons collide; the measured complete-page width edge is 967px with document scrolling. These are current implementation boundaries, not approved support cutoffs or usability claims. Selected Firefox/WebKit geometry checks agree; a Firefox Vite-forwarded ResizeObserver warning remains recorded.

Proposed corrections now have direct evidence: resource wrapping/menu alignment, compact scoreboard/turn-strip placement, expanded side-stack clearance, and replay compact-dugout controls. The owner subsequently deferred these corrections to [#389](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/389) and directed that dimensions be defined now. This backlog is not a dependency of policy/support documentation. Product code and the public support page remain unchanged.

Concrete working dimensions are recorded in `docs/specs/supported-hardware-display-dimensions.md`: live coaching/spectating layout-fit reference 1350x300 CSS pixels; replay reference 980x320 with normal scrolling. Recommended usable viewports are 1920x900 desktop, 1366x768 smaller laptop/landscape tablet and 1024x600 replay. These are tested, conservative pairs rather than exact mathematical minima, comfortable-play guarantees or access gates. Phone viewing remains a target with known compact-layout limitations. New Chrome checks passed 729 live combinations at 1350x300, 27 each at 1366x768 and 1920x900, 18 selected interaction checks, and both replay fixtures at 980x320 and 1024x600. Evidence: `docs/research/documented-display-dimensions-evidence.json`. Larger all-state validation and remaining OS/browser/hardware policy decisions retain their scope; UI corrections will be scheduled separately.

The owner subsequently approved implementing the support-page guidance, including recommended dimensions, mouse/keyboard and touch support, a 100/125/150/175/200% display-scaling calculator, and best-judgment future-animation hardware examples. This slice is tracked in [#390](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/390), with implementation on `feat/support-device-guidance` in `.tools/worktrees/support-device-guidance`. Its specification and outcome report are under `docs/specs/support-device-guidance*.md` in that worktree. Desktop four-core/8 GB and 16 GB headroom, iPad 10/A16 and M1 Air/Pro tiers, and flagship Galaxy Tab S8/S9 with 8 GB+ are explicitly estimates; they do not establish benchmarked minima. No new OS/browser version floors or access gates are introduced.

Next checkpoint: review the local support page and continue reviewing remaining platform proposals case by case. The measured fit references stay distinct from comfortable viewing recommendations, and compact UI corrections remain deferred to #389. Publication, commit and push are not authorized.

Maintain the issue and local design mirror together. After approved implementation, produce an outcome report mapping requirements to results, exact checks, coverage estimates, visual evidence and unresolved limitations. Do not mark unverified support claims or unapproved changes complete.
