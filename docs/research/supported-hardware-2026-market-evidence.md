# Supported hardware: 2026 market evidence

Research date: **2026-10-31**. Tracking: [#388](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388); [parent specification](../specs/supported-hardware-and-system-requirements.md). Scope: preparation for policy review, not approval of support exclusions, numeric minimums or implementation. No existing general research-note directory was found; this report establishes `docs/research` for the requested evidence.

## Findings and evidence boundaries

Policy updates after this research: broad practical coverage takes precedence over the earlier approximate 99% aspiration. The owner subsequently approved desktop-first coaching, landscape tablet coaching and phone website/replay/spectating support, with direct phone coaching best effort. Display reference sizes are recommendations; only measured absolute layout-fit minima may become technical display limits. The statistics and limitations below remain evidence, not verification of that policy. See the [current policy](../specs/supported-hardware-policy-proposal.md).

Desktop/laptop, phone and tablet all merit explicit consideration. Browser-family evidence supports investigating Chrome, Safari, Edge, Firefox, Samsung Internet and Opera, alongside the unclassified tail. It does **not** establish that implementing or testing those names covers 99% of MUTP players. The EU-specific evidence below measures people using devices; the North America/UK/Europe technical tables measure page views. They cannot be combined into a measured player-coverage percentage.

The technical tables transcribe the first-party StatCounter page summaries retrieved on the research date. **September 2026 is the latest completed month verified here**, except the explicitly marked August tablet-resolution row. October was still in progress on the research date. Sources are mutable, not archival snapshots: the linked default pages will advance. Some cached URL variants returned older months; each table uses the month printed in the retrieved source, not its crawl date or an assumed URL-fragment selection.

StatCounter measures page views across participating sites, not people or installed devices. Its methodology describes more than one million sites, bot removal, no artificial geographic weighting and a Chrome prerendering adjustment. Desktop includes laptops. Figures can be revised for 45 days after first publication; September therefore remains provisional here. Its public sample-size examples are dated July 2022, not September 2026. No current regional cell counts or confidence intervals were obtained. [StatCounter methodology and FAQ](https://gs.statcounter.com/faq)

**Geography:** North America is StatCounter's regional aggregate, not a synonym for the US/Canada player base. Europe is explicitly a **continental proxy, not EU-27**. Do not add UK and Europe as disjoint regions. No exact EU-27 browser, OS or screen aggregate was verified. Two EU-country browser observations illustrate variation without purporting to represent the EU.

## Device categories and people

Percent of measured desktop/mobile/tablet page views, September 2026; this particular denominator excludes other platform categories.

| Geography | Desktop, including laptop | Mobile | Tablet | Source |
| --- | ---: | ---: | ---: | --- |
| North America | 48.26% | 49.36% | 2.38% | [StatCounter](https://gs.statcounter.com/platform-market-share/desktop-mobile-tablet/north-america/) |
| UK | 41.78% | 53.56% | 4.66% | [StatCounter](https://gs.statcounter.com/platform-market-share/desktop-mobile-tablet/united-kingdom/) |
| Europe, not EU | 42.32% | 55.41% | 2.27% | [StatCounter](https://gs.statcounter.com/platform-market-share/desktop-mobile-tablet/europe/) |

The following are overlapping device-access/use measures; rows must not sum to 100%.

| Survey geography and period | Phone | Laptop | Desktop | Tablet | Denominator and source |
| --- | ---: | ---: | ---: | ---: | --- |
| EU, 2025 | Almost 9 in 10 | 56% | 31% | 31% | All individuals aged 16–74; devices used to access internet. [Eurostat, Figure 4 and preceding text, pp. 5–6](https://ec.europa.eu/eurostat/statistics-explained/SEPDF/cache/33472.pdf) |
| UK, 2025/26 | 93% | 67% | 24% | 52% | All adults; devices available for personal use, not necessarily owned. [DSIT, section 3.2](https://www.gov.uk/government/statistics/dsit-public-engagement-survey-20252026/dsit-public-engagement-survey-20252026) |

Eurostat's PDF bears a 30 October 2026 generation date but says data were extracted in December 2025: these are **2025 observations accessed in 2026**, not 2026 device-use measurements. Its Figure 4 specifies all individuals 16–74 despite nearby prose sometimes saying users; keep the chart denominator. The article reports tablet internet use of 49% in Ireland and the Netherlands, demonstrating within-EU variation. These are rounded survey estimates, not exact traffic shares. [Eurostat](https://ec.europa.eu/eurostat/statistics-explained/SEPDF/cache/33472.pdf)

DSIT published on 16 July 2026, with fieldwork November 2025–March 2026. Its final dataset contains 30,698 respondents, using online and paper responses; estimated individual response was 21%. Non-response, survey weighting and question wording matter; no model, screen-size or browser cross-tabulation was established here. Tablet access at 52% alongside 4.66% tablet page views shows why traffic share cannot justify treating tablet users as negligible. [DSIT methodology and results](https://www.gov.uk/government/statistics/dsit-public-engagement-survey-20252026/dsit-public-engagement-survey-20252026)

## Browser families

September 2026, **all-platform page views**, including any platform categories outside the preceding three-category comparison. A dash means not in the six displayed categories, not zero. Remainders are calculated as 100 minus displayed categories, with rounding uncertainty.

| Geography | Chrome | Safari | Edge | Firefox | Samsung Internet | Opera | Other displayed category | Remainder | Source |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| North America | 54.09% | 30.36% | 7.45% | 3.27% | 1.79% | 1.15% | — | 1.89% | [StatCounter](https://gs.statcounter.com/browser-market-share/all/north-america/) |
| UK | 49.87% | 29.90% | 11.91% | 1.89% | 3.84% | — | Android 0.94% | 1.65% | [StatCounter](https://gs.statcounter.com/browser-market-share/all/united-kingdom/) |
| Europe, not EU | 60.01% | 19.94% | 7.29% | 4.30% | 3.41% | 2.49% | — | 2.56% | [StatCounter](https://gs.statcounter.com/browser-market-share/all/europe/) |
| Germany only | 57.60% | 16.86% | 7.69% | 8.18% | 4.53% | 3.20% | — | 1.94% | [StatCounter](https://gs.statcounter.com/browser-market-share/all/germany/) |
| France only | 59.45% | 20.03% | 7.00% | 6.59% | 3.07% | 1.75% | — | 2.11% | [StatCounter](https://gs.statcounter.com/browser-market-share/all/france/) |

Inference: Chrome/Safari/Edge/Firefox alone total 95.17% in North America, 93.57% in the UK and 91.54% in Europe. Even the six displayed categories total less than 99% in each. These sums describe reported labels, not unique rendering engines, supported versions or successful play. The UK label “Android” is a browser category here, not the OS. Neither engine equivalence nor a chosen browser-version floor can be inferred from this table. Germany's Firefox share also cautions against a uniform regional weighting.

## Operating systems and older systems

September 2026 shares within each **platform's page views**. Preserve StatCounter's labels: “OS X” and “macOS” are separate reported categories, not proof of obsolete versus current Apple systems. Tablet “iOS” must not be read as a distinct measurement of iPadOS versions.

| Platform / geography | Reported categories | Source |
| --- | --- | --- |
| Desktop / North America | Windows 65.27%; OS X 17.86%; macOS 8.43%; Chrome OS 4.91%; Linux 3.53% | [StatCounter](https://gs.statcounter.com/os-market-share/desktop/north-america/) |
| Desktop / UK | Windows 68.87%; OS X 17.42%; macOS 7.28%; Linux 3.55%; Chrome OS 2.87% | [StatCounter](https://gs.statcounter.com/os-market-share/desktop/united-kingdom/) |
| Desktop / Europe, not EU | Windows 77.28%; OS X 10.93%; macOS 5.57%; Linux 4.61%; Chrome OS 1.60% | [StatCounter](https://gs.statcounter.com/os-market-share/desktop/europe/) |
| Mobile / North America | iOS 53.03%; Android 46.95% | [StatCounter](https://gs.statcounter.com/os-market-share/mobile/north-america/) |
| Mobile / UK | Android 53.02%; iOS 46.97% | [StatCounter](https://gs.statcounter.com/os-market-share/mobile/united-kingdom/) |
| Mobile / Europe, not EU | Android 64.68%; iOS 35.31% | [StatCounter](https://gs.statcounter.com/os-market-share/mobile/europe/) |
| Tablet / North America | iOS 55.48%; Android 44.46% | [StatCounter](https://gs.statcounter.com/os-market-share/tablet/north-america/) |
| Tablet / UK | iOS 51.40%; Android 48.59% | [StatCounter](https://gs.statcounter.com/os-market-share/tablet/united-kingdom/) |
| Tablet / Europe, not EU | Android 54.26%; iOS 45.70% | [StatCounter](https://gs.statcounter.com/os-market-share/tablet/europe/) |

Chrome OS deserves explicit review: it is distinct from Linux in these figures and absent from the parent's named OS list. That is a research question, not an automatic scope change. Small unlisted OS categories and rounding account for residuals.

September Android-version distributions provide evidence against assuming everyone has the latest OS. Denominator: **Android mobile/tablet page views**, not all phones or installed Android devices.

| Geography | 16 | 15 | 14 | 13 | 12 | 11 | Source |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| North America | 45.46% | 10.63% | 9.73% | 10.72% | 6.23% | 5.55% | [StatCounter](https://gs.statcounter.com/android-version-market-share/mobile-tablet/north-america) |
| UK | 41.83% | 10.50% | 10.92% | 10.29% | 6.56% | 6.34% | [StatCounter](https://gs.statcounter.com/android-version-market-share/mobile-tablet/united-kingdom/) |
| Europe, not EU | 40.10% | 13.58% | 12.62% | 11.92% | 6.75% | 5.83% | [StatCounter](https://gs.statcounter.com/android-version-market-share/mobile-tablet/europe/) |

Versions outside these six remain unenumerated. OS age does not establish hardware age, RAM, browser freshness, update entitlement or performance. No OS floor follows from these marginal counts.

## Screen sizes and useful candidate geometry

Top reported resolutions, percentage of the corresponding platform's page views. All rows are September 2026 **except NA tablet, August**. These are six leading categories, not a cumulative distribution or usable match viewports.

| Platform / geography | Reported resolution: share | Source |
| --- | --- | --- |
| Desktop / North America | 1920×1080: 26.76%; 1536×864: 7.48%; 1366×768: 6.84%; 1280×720: 3.96%; 2560×1440: 3.90%; 1440×900: 3.72% | [StatCounter](https://gs.statcounter.com/screen-resolution-stats/desktop/north-america/) |
| Desktop / UK | 1920×1080: 35.59%; 1536×864: 9.66%; 1280×720: 4.52%; 1366×768: 3.71%; 1440×900: 3.56%; 2560×1440: 3.54% | [StatCounter](https://gs.statcounter.com/screen-resolution-stats/desktop/united-kingdom/) |
| Desktop / Europe, not EU | 1920×1080: 30.86%; 1536×864: 12.50%; 2560×1440: 5.29%; 1366×768: 5.12%; 1280×720: 4.24%; 1440×900: 2.85% | [StatCounter](https://gs.statcounter.com/screen-resolution-stats/desktop/europe/) |
| Mobile / North America | 414×896: 19.12%; 390×844: 10.12%; 384×832: 8.15%; 393×852: 4.57%; 360×780: 4.41%; 402×874: 4.21% | [StatCounter](https://gs.statcounter.com/screen-resolution-stats/mobile/north-america) |
| Mobile / UK | 414×896: 20.75%; 390×844: 10.79%; 384×832: 10.03%; 360×780: 6.18%; 375×667: 4.91%; 412×915: 3.79% | [StatCounter](https://gs.statcounter.com/screen-resolution-stats/mobile/united-kingdom/) |
| Mobile / Europe, not EU | 414×896: 16.30%; 384×832: 10.61%; 390×844: 8.01%; 393×873: 6.00%; 360×780: 5.40%; 360×800: 4.96% | [StatCounter](https://gs.statcounter.com/screen-resolution-stats/mobile/europe/) |
| Tablet / North America, **August 2026** | 800×1280: 9.54%; 768×1024: 8.98%; 1280×800: 8.71%; 820×1180: 7.24%; 810×1080: 6.41%; 601×962: 3.99% | [StatCounter](https://gs.statcounter.com/screen-resolution-stats/tablet/north-america) |
| Tablet / UK | 768×1024: 13.21%; 800×1280: 9.98%; 1280×800: 9.47%; 810×1080: 5.42%; 601×962: 4.53%; 1180×651: 2.48% | [StatCounter](https://gs.statcounter.com/screen-resolution-stats/tablet/united-kingdom/) |
| Tablet / Europe, not EU | 1280×800: 10.53%; 768×1024: 10.37%; 800×1280: 9.93%; 810×1080: 4.62%; 820×1180: 2.60%; 601×962: 2.46% | [StatCounter](https://gs.statcounter.com/screen-resolution-stats/tablet/europe/) |

The browser's screen dimensions and its content viewport are different quantities. CSSOM View defines screen, layout viewport and visual viewport APIs in CSS pixels; zoom changes their relationship. Physical panel pixels, logical screen dimensions and the unobstructed space available to controls must be recorded separately. [W3C CSSOM View](https://www.w3.org/TR/cssom-view/)

Inference: retain candidate checks for 1280×720/1366×768 desktop screens, 360–414-wide phone screen classes including the UK 375×667 category, and small/standard tablets around 601×962, 768×1024 and 800×1280. Measure actual landscape content space with browser controls, scaling, split-screen and keyboard. Rotating a screen-size pair is a test input, not evidence that the full rotated dimensions are available. None of these figures establishes a minimum viewport or identifies a particular device model.

## Coverage method and remaining research

No defensible 99% player-coverage estimate is available. A meaningful denominator must first distinguish existing players, prospective players, unique people with at least one suitable device, devices, visits and completed matches. Website access, spectating, replay and comfortable full-match play need separate success definitions. A person with a usable laptop and unusable phone illustrates why device coverage differs from person coverage.

For a future estimate, define mutually exclusive North America/UK/EU geography and activity strata, document player-relevant weights, then estimate **joint** success within each stratum. Weight by the intended population, not the arbitrary number of test cases. Do not average country percentages equally, pool UK into Europe and count it twice, or multiply separate browser/OS/screen percentages: combinations are dependent and the source denominators differ. Even 99% coverage on each of three separate dimensions does not prove 99% jointly. Report uncertainty and unknown combinations rather than assigning them success.

Candidate investigation categories are Windows/Linux/macOS/Chrome OS desktop browsers; Android Chrome/Samsung Internet and other named families; Apple phone/tablet Safari plus relevant alternative browsers; older/small phones; budget and midrange tablets/laptops; and the unclassified browser tail. This is a breadth checklist, not an approved support matrix or an engine-equivalence claim.

Unresolved evidence: exact EU-27 technical distributions with appropriate weights; full screen-resolution tails and real viewport distributions; regional browser/OS versions and their combinations; model/age/price-class installed base; actual MUTP audience distribution; essential-task completion and physical-device performance. Official model specifications can define representative specimens but cannot establish their installed-base popularity. Local engine/profile/emulator tests provide compatibility observations, not population estimates or physical-device performance. The absence of Apple hardware remains a validation gap rather than evidence for excluding Apple users.

Access limitations: Eurostat HTML failed through the research tool; its official PDF supplied the cited data. NA tablet-resolution slash URLs failed or returned older data; August is the newest verified row, not a claim that September does not exist. No telemetry, paid service, new account, policy change or application modification was performed for this report.
