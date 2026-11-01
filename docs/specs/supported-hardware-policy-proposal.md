# Supported-hardware policy: approved experience targets and remaining proposals

Date: 2026-10-31. Parent: [#388](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388) and [feature specification](supported-hardware-and-system-requirements.md).

**Status: experience policy approved; working dimensions defined; UI corrections deferred.** On 2026-10-31 the owner approved desktop-first live play, landscape tablet play, and phone website/replay/spectating support, then directed that specific dimensions be defined without waiting for UI corrections. The [working dimensions](supported-hardware-display-dimensions.md) provide tested layout-fit references and separate recommendations. They are guidance, not eligibility gates or universal all-state guarantees. Browser/OS cutoffs and hardware budgets below remain proposals. Intended support is separate from verified compatibility. No product code or public support-page content has changed.

## Policy intent

Optimize for a good game experience on mainstream systems from the last several years. Support suitable older hardware when it can run the same maintained browser and presentation capabilities; do not create permanent legacy implementations for it. Hardware age alone is a poor exclusion rule: an older capable laptop may be a better match device than a recent compact phone.

There is no required percentage-coverage target. Regional statistics help prioritize work, but exact EU technical distributions, model installed-base counts and a proven 99% result are not gates. Keep the existing research as evidence, not a backlog of measurements that must all be completed before proceeding.

Use three support categories, separately from evidence status:

- **Supported target:** meets the approved OS/browser, display and capability policy; receives compatibility work and selected release validation. Each target separately records tested/emulated/unverified evidence.
- **Best effort:** may work, but does not receive dedicated fixes or constrain new features. This covers near-boundary or older configurations where the same implementation still runs.
- **Outside support:** known obsolete or insufficient configurations. No special renderer, polyfill stack or tiny-match redesign is promised. Do not deliberately break working access; explain actual capability failures and preserve website/recovery access where possible.

## P1. Approved experience and display policy

**Current dimension proposal:** live interface **1350×300 CSS pixels** as the rounded tested layout-fit reference; **1920×900** recommended desktop content space and **1366×768** smaller laptop/landscape-tablet reference. Replay: **980×320** layout-fit reference with normal scrolling; **1024×600** recommended. See the [dimension decision and validation](supported-hardware-display-dimensions.md). These are specific conservative pairs, not exact mathematical minima or proof of comfortable coaching at the lower bound. The owner explicitly deferred resource/scoreboard/dugout corrections to [#389](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/389); fixing that backlog is not a prerequisite for documenting dimensions.

Desktop/laptop live play is the primary design target. Landscape tablets are supported live-play targets. Phones are supported targets for the website, team/account functions, replay and spectating; viewing is the recommended phone interaction. Direct phone coaching remains best effort, without a dedicated compact-play guarantee. Landscape is recommended for phone pitch viewing; normal website pages should reflow in portrait.

| Experience | Design/review reference | Support interpretation |
| --- | --- | --- |
| Desktop/laptop coaching | 1920×1080 CSS viewport fullscreen; approximately 1920×945 maximized with the measured Windows/Chrome toolbar arrangement | Primary reference, not a minimum or a requirement to disable scaling |
| Scaled laptop coaching | Include 1280×720 fullscreen and approximately 1280×665 maximized in validation | Smaller modern-system scenarios; no automatic exclusion below 720px height |
| Landscape tablet coaching | Start with 1024×768 and 1280×800 CSS reference viewports; also exercise 3:2 geometry | Validate 4:3, 3:2 and 16:10 shapes, touch controls, browser UI and keyboard effects; these are not minimums |
| Phone website, replay and spectating | Representative portrait website and landscape viewing profiles from the baseline report | Support viewing controls, inspection and recovery; do not infer viewing success from coach-layout or listing-page tests |
| Phone direct coaching | Existing layout and input where usable | Best effort; do not shrink the primary UI or promise a special phone coaching layout |

All layout dimensions are usable **CSS content pixels**, after browser controls and relevant safe areas. Physical panel resolution, OS display scaling and browser zoom must be explained separately. A 1920×1080 panel gives a 1920×1080 fullscreen CSS viewport only at 100% OS scaling and 100% browser zoom in the ordinary desktop configuration. At 125% OS scaling and 100% browser zoom it gives approximately 1536×864. Maximized content height varies with browser and taskbar configuration. Do not present approximate examples as universal measurements.

For public guidance, start with 100% browser zoom, retain comfortable OS scaling, and suggest a larger window, optional fullscreen, or landscape viewing when useful. Do not prescribe 100% OS scaling on dense laptop/tablet panels or zooming out to make unreadable controls fit. Recommend a desktop/laptop or suitable landscape tablet for coaching when phone controls are too cramped.

The earlier 360px website floor, 1024×600 standard-match floor, 720×340 compact-match floor and 800×360 alternative are **superseded proposals**, not support limits. The new rounded references have bounded measurement evidence, while a universal all-state absolute minimum is not claimed. Do not introduce an eligibility gate at a reference size or by OS/device label.

**Absolute layout minima:** measure separately for coaching, live spectating and replay. Find the smallest usable width/height combinations where the relevant visible screen elements fit without unintended overlap or clipping. Include long names, all themes, crowded matches, both coaches/camera views, decisions, menus, chat/log and dugout states, replay controls, touch targets and recovery. Intended overlays and deliberately collapsed panels need explicit test expectations; do not hide required controls to declare a pass. Report any dependence on panel state or aspect ratio rather than inventing a universal pixel-area threshold. A layout passing this fit check does not establish comfortable readability, reliable touch interaction, or a usable playing experience.

Only evidence-backed absolute fit minima may be published as technical display limits. Below them, explain the collision risk and offer best-effort continuation; a hard access block is not approved. Defects above the fit minimum remain subject to the experience policy: phone viewing gets support, phone coaching does not become guaranteed merely because the elements fit.

**Measurement update, 2026-10-31:** [live/replay layout research](../research/layout-minima-2026.md) now establishes bounded failure edges, not a universal limit. The resource-rich live fixture passes 729 panel/role/phase combinations at 1347×280, while a four-resource fixture passes 1097×600. Phone viewing exposes resource/scoreboard/expanded-stack defects; replay playback remains reachable but compact-dugout controls collide below its measured 967px page-width edge. These exact incidental code boundaries are not adopted as support minima. The owner later directed that rounded, qualified reference dimensions be documented now and the fixes deferred to #389. See the current dimension decision above; retain the approved experience targets.

**Zoom and keyboard:** temporary viewport reductions must not discard a match, obscure reconnect, disable text enlargement, or trigger a hard lockout. Keep useful short-height/narrow rules for scaled desktops, tablet keyboards and phone viewing. No blanket CSS removal follows from deprioritizing phone coaching. Fullscreen is optional.

## P2. Browser maintenance window

| Browser family | Proposed supported versions | Validation emphasis |
| --- | --- | --- |
| Chrome and Edge | Current and immediately previous stable major | Test current branded browsers; validate previous supported major when a changed feature puts it at risk |
| Firefox | Current and immediately previous stable major, plus current maintained ESR line | Chromium results do not stand in for Firefox |
| Safari | Current and previous annual major family, latest available patches | Local WebKit is engine evidence; actual Safari/Apple OS behavior remains separately unverified |
| Samsung Internet | Current stable | Explicit Android compatibility target, not inferred solely from its rendering-engine family |
| Other browsers, including Opera/Brave and embedded in-app browsers | Best effort unless individually added | No automatic support claim from shared Chromium ancestry |

No Internet Explorer, legacy EdgeHTML, frozen old browsers or compatibility-mode support. Do not pin product support to Vite's historic defaults. Choose modern APIs and CSS within the approved target matrix; consider a small targeted fallback only when it benefits an in-scope target, not to restore an abandoned platform.

A matrix is recorded at each product release rather than silently changing a running application's eligibility whenever a browser publishes an update. Review the policy every six months, and explain material cutoff changes in release notes and on the support page.

This is a project policy recommendation, not a claim that browser vendors promise the same window. Current browser installation floors are much broader than the experience MUTP should promise: for example, Google's Chrome requirements still list Windows 10, whereas Microsoft ended ordinary Windows 10 support in October 2025. [Google Chrome requirements](https://support.google.com/chrome/a/answer/7100626?hl=en), [Microsoft lifecycle](https://learn.microsoft.com/en-us/lifecycle/announcements/windows-10-end-of-support)

## P3. OS targets

| Platform | Proposed boundary | Deliberate exclusions / limits |
| --- | --- | --- |
| Windows | Windows 11, in a maintained release | Windows 10 and earlier best effort only, including extended-support arrangements; no Windows-specific legacy work |
| Android | Android 13 or newer, with a browser in the maintenance window | Android 12 and earlier best effort; no obsolete-browser workarounds |
| iPhone/iPad | iOS/iPadOS 26 or newer, paired with the proposed Safari generation window | Older OS generations best effort; device eligibility still depends on usable display space |
| macOS | macOS 15 or newer, with a supported browser | Older macOS best effort; hardware must be able to update its browser |
| Linux | Maintained 64-bit distribution with a supported current browser; Ubuntu 24.04/26.04 as reference environments | No exhaustive distribution/desktop/driver certification or frozen distro-browser packages |
| ChromeOS | Device within Google's automatic-update period and running supported current Chrome | Expired-update devices best effort; no separate legacy Chromebook renderer |

Android 13 is a proposed practical age boundary, not Google's Chrome installation minimum and not proof that every Android 13 device still receives vendor security updates. Require current available browser patches and recommend a device receiving OS security updates. Individual CPU/RAM/driver limitations still need evidence.

Apple version boundaries should be reviewed against its security/release information at implementation and each subsequent policy review; the current/previous Safari-generation condition is additional to the OS floor. The recommendation does not claim Apple hardware has been tested. [Apple release information](https://support.apple.com/en-us/100100)

Ubuntu references keep Linux validation bounded without unnecessarily forbidding another maintained distribution running the same supported browser. ChromeOS deserves inclusion based on the regional evidence; its per-device update expiry is a better retirement signal than purchase date alone. [Ubuntu release cycle](https://ubuntu.com/about/release-cycle), [Google automatic-update policy](https://support.google.com/chrome/a/answer/6220366?hl=en), [market report](../research/supported-hardware-2026-market-evidence.md)

## P4. Hardware and graphics expectations

Use the following as **proposed reference-device budgets pending validation**, not already measured hard minimums:

| Class | Starting reference budget | Recommended budget |
| --- | --- | --- |
| Desktop/laptop | 64-bit multicore system, 8 GB system RAM, modern integrated graphics | 16 GB RAM; a mainstream laptop/desktop GPU |
| Android phone/tablet | 4 GB system RAM with a maintained browser | 6 GB or more |
| Apple phone/tablet | A device eligible for the approved OS/browser window and usable viewport | Larger-display model where comfortable match play matters |
| Chromebook | 8 GB reference target | 8 GB or more; 4 GB models remain best effort unless measurements justify inclusion |

These choices provide concrete starting points for testing and public guidance. The earlier representative hardware report includes 4 GB Android budget specimens. It does not establish that 4 GB is sufficient for every match or that a lower-memory system cannot work. Apple does not consistently publish RAM in the cited consumer specifications; avoid an unverifiable public RAM gate for those devices.

Do not use browser-reported RAM, a CPU brand string, device age, or a model allowlist to block entry. Retain the 8/4 GB figures as provisional guidance until crowded-match measurements support promoting them to actual minimum requirements. If validation is unavailable, the support page must say recommended hardware rather than asserting a measured minimum.

Expect browser hardware acceleration to be available for the intended experience; a dedicated graphics card is not a proposed requirement. Software rendering and obsolete GPU/driver paths are best effort. Preserve room for richer graphics on the supported matrix, but do not add a WebGL/WebGPU requirement merely because a diagnostic dependency exists: the current product pitch uses DOM/SVG. A future renderer or graphics-feature change needs its own capability validation and scope approval.

Reuse the existing responsiveness measurement work instead of inventing CPU-clock or GPU-model cutoffs. Evaluate crowded scenes, pan/zoom, input feedback, memory growth and longer sessions on reference hardware. Do not derive physical-device performance from emulator timing.

## P5. What support outside these boundaries means

- Keep the public website accessible wherever its ordinary implementation works.
- Recommend desktop/laptop or landscape tablet for coaching, and website/replay/spectating for phones. Explain measured layout-fit failures and suggest rotation or more space; permit best-effort continuation. Recommendations alone do not trigger a too-small warning.
- Preserve recovery, connection status and pending-action identity. A threshold crossing is presentation state, not a match-state transition.
- A reproducible defect in a supported experience is compatibility work. Phone-coaching cosmetic issues do not require a dedicated layout unless they also affect phone viewing, zoom, recovery or another supported use case.
- Missing essential browser capabilities may make the match client unavailable; provide a useful message where detection can run. Do not deliberately break capable but unlisted devices.
- Do not freeze graphics/UI development solely to preserve an older unsupported environment.
- Continue distinguishing intended support from evidence: native OS/browser, patched engine, emulator, physical device, or not yet verified.

## P6. Proposed implementation cases

These are candidates for later tickets, not authorization to start code changes. See the [code change assessment](supported-hardware-code-change-assessment.md) for file-level evidence and required versus conditional work.

| Case | Proposed result | Dependency and approval point |
| --- | --- | --- |
| C1. Public support information | Approved experience roles, viewing/scale recommendations and evidence labels; support page updated with review date | P1 approved; do not publish pending P2–P4 proposals as settled requirements |
| C2. Layout-fit measurement and optional guidance | Determine role-specific collision minima; optional accessible guidance reevaluates on resize without disturbing recovery | Measurement can continue under research authorization; any runtime warning needs a concrete reviewed proposal |
| C3. Layout and regression coverage | Desktop-first, landscape tablet coaching, phone website/replay/spectating; preserve zoom/keyboard safeguards | Approve targeted fixes after observed failures; no automatic CSS removal |
| C4. Browser and graphics capability handling | Align build targets and real capabilities; handle missing fullscreen capability; no blanket legacy polyfills | P2/P3; approve concrete detected gaps |
| C5. WebKit layout investigation | Reproduce ResizeObserver notifications in product builds, trace cause, then propose scoped correction | Independent diagnosis can continue; any product fix remains reviewable |
| C6. Validation environment and matrix | Resolve Android ADB trust/setup; test tablet coaching and phone viewing separately; configure Linux; cover all themes and lifecycle paths | Existing hardware/access limits remain explicit |
| C7. Release evidence | Focused checks, required builds and integrated tests, updated support-page confidence and outcome report | Approved implementation cases complete |

Research notes and the present proposal remain engineering documentation. The support page should carry the final user-facing requirements, known limits and evidence status, not speculative figures or internal test logs.

## Proposed public support-page wording

This is approved policy direction drafted for later support-page implementation. Verification notes and any eventual fit minima must match actual evidence:

> MUTP is designed first for playing on a desktop or laptop, with landscape tablet play also supported as a target. Phones are best suited to the website, watching live matches and viewing replays. Direct play on a phone may work, but its controls can be cramped and it is not our recommended coaching experience.
>
> A 1080p desktop display at 100% Windows scaling and 100% browser zoom is our main design reference. This provides 1920×1080 CSS pixels in fullscreen; a normal maximized browser has less usable height. It is a recommendation, not an entry requirement. Keep OS scaling and text sizes comfortable, especially on a high-density laptop or tablet. Start at 100% browser zoom and adjust for readability. Fullscreen is optional; landscape usually provides more useful pitch space on tablets and phones.
>
> Screen specifications use physical pixels; the game lays out its controls in CSS pixels. OS scaling, browser zoom, browser controls and the on-screen keyboard change the space available. Our tested layout-fit references are 1350×300 for the live interface and 980×320 for replay with scrolling; these are not comfortable-play recommendations or hard access limits. Recommended usable space is 1920×900 for desktop play, 1366×768 for smaller laptop/landscape-tablet play and 1024×600 for replay. Known compact-layout collisions remain tracked for later improvement.
>
> Compatibility testing is ongoing. Intended support is separate from tested-device coverage. Apple engine checks use WebKit automation; physical iPad and Mac validation is not claimed. Phone viewing and tablet coaching still require the additional checks recorded in our validation plan.

Hardware memory figures should only be added as measured minimums after validation, or explicitly labeled as recommendations. No percentage-of-users claim is needed.

## Approval state

Approved: broad practical coverage; desktop-first coaching; landscape tablet coaching; phone website/replay/spectating support and viewing recommendation; direct phone coaching best effort; public resolution/scaling recommendations rather than arbitrary display cutoffs. Only evidence-backed absolute layout minima may be technical display limits, without claiming that fit equals usability. No obligation to preserve very old platforms at the cost of UI/UX or graphics.

Working display pairs and evidence are recorded in the dimension decision; they remain reviewable policy wording, not a new enforcement mechanism. Pending: P2 browser window; P3 OS boundaries including ChromeOS; P4 provisional hardware guidance; and individual implementation cases. UI corrections are explicitly backlogged in #389. Prior approval covers best-effort continuation, recovery preservation, Apple inclusion, and narrow compatibility UI changes in principle. No browser/OS/RAM proposal or runtime change is implicitly approved.

No product implementation, support-page edit, commit, merge or deployment is performed by this proposal.
