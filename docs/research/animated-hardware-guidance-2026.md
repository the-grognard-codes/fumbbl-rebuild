# Estimated hardware for future animated matches

Research date: **2026-10-31**. Companion to the [hardware policy and baseline investigation](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/388) and [support page specification](../specs/support-device-guidance.md). Scope: best-judgment hardware guidance for planned animated player sprites, pitch and stadium. Manufacturer specifications verify device identities and capabilities; they do not verify MUTP performance.

## Recommendation and evidence boundary

Publish **estimated entry level** and **recommended headroom**, rather than tested minimums. No benchmark of the future combined animation workload exists in this evidence. Apple physical-device validation remains unavailable. The project owner's approved experience policy is desktop-first coaching, landscape tablet coaching, and phone website/replay/spectating support, with direct phone coaching best effort; hardware estimates do not override layout requirements or resolve known phone collisions.

The tiers below are engineering estimates, not vendor recommendations, a purchase requirement, or a guarantee of a frame rate. A device below an estimate is not automatically incompatible. The future implementation's texture sizes, simultaneous animation, render resolution, compositing, browser behavior, thermal limits and memory pressure can change the outcome.

| Platform | Estimated entry level | Recommended headroom |
| --- | --- | --- |
| Desktop or laptop | Modern mainstream four-core processor, 8 GB system RAM, integrated graphics with browser hardware acceleration enabled | 16 GB RAM and a recent integrated GPU with hardware acceleration enabled; a dedicated GPU is not part of this estimated requirement |
| Full-size iPad, landscape | iPad (10th generation, 2022, A14); iPad (A16, 2025) is another entry-tier example | iPad Air (5th generation, 2022, M1), iPad Pro 11-inch (3rd generation, 2021, M1), or iPad Pro 12.9-inch (5th generation, 2021, M1); later M-series Air/Pro models are reasonable headroom candidates |
| Galaxy Tab, landscape | Flagship Galaxy Tab S8, S8+ or S8 Ultra (2022), at least 8 GB RAM | Flagship Galaxy Tab S9, S9+ or S9 Ultra (2023), at least 8 GB RAM; assess subsequent flagship models by actual chip and memory |

The desktop four-core/8 GB/16 GB values are deliberately broad planning estimates, not thresholds established by the market research or local host. CPU core count alone cannot establish equivalence between desktop processors or tablet chips. Integrated graphics are a reasonable target for this browser-based 2D workload; that expectation still needs measurement. Avoid a claimed minimum GPU model or FPS until representative integrated-graphics hardware has run the finished scene.

## Manufacturer facts supporting the examples

| Model | Verified facts | Primary source |
| --- | --- | --- |
| iPad (10th generation) | Introduced 2022; A14 Bionic; six-core CPU and four-core graphics; 2360 × 1640 panel | [Apple technical specifications](https://support.apple.com/en-us/111840) |
| iPad (A16) | Introduced 2025; A16; five-core CPU and four-core GPU; 2360 × 1640 panel | [Apple technical specifications](https://support.apple.com/en-us/122240) |
| iPad Air (5th generation) | Introduced 2022; M1; eight-core CPU and GPU; 8 GB RAM | [Apple technical specifications](https://support.apple.com/en-gb/111887) |
| iPad Pro 11-inch (3rd generation) | M1; eight-core CPU and GPU; 8 GB RAM with 128/256/512 GB storage, 16 GB with 1/2 TB | [Apple technical specifications](https://support.apple.com/en-us/111897) |
| iPad Pro 12.9-inch (5th generation) | M1; eight-core CPU and GPU; same 8/16 GB RAM split by storage capacity | [Apple technical specifications](https://support.apple.com/en-ie/111896) |
| M1 iPad Pro release | Apple's 2021 announcement introduces the M1-powered 11-inch and 12.9-inch models | [Apple announcement](https://www.apple.com/newsroom/2021/04/apple-unveils-new-ipad-pro-with-m1-chip-and-stunning-liquid-retina-xdr-display/) |
| Galaxy Tab S8 and S8+ | Snapdragon 8 Gen 1; 8 GB RAM in Samsung's US Wi-Fi sheet | [Samsung specification sheet](https://image-us.samsung.com/SamsungUS/samsungbusiness/pdfs/spec-sheet/Galaxy_Tab_S8_Series_Spec_Sheet_2.pdf#page=2) |
| Galaxy Tab S8 family | 2022 release; S8/S8+ have 8/12 GB options, Ultra has 8/12/16 GB; availability varies by model and market | [Samsung launch and specifications](https://news.samsung.com/global/breaking-the-rules-with-galaxy-tab-s8-series-the-biggest-boldest-most-versatile-galaxy-tablet-ever) |
| Galaxy Tab S9 family | 2023 release; Snapdragon 8 Gen 2 for Galaxy; base S9 has 8/12 GB options, S9+ 12 GB, Ultra 12/16 GB; configurations vary by market | [Samsung launch and specifications](https://samsungmobilepress.com/articles/samsung-galaxy-tab-s9-sets-the-new-standard-to-bring-galaxys-premium-experience-to-a-tablet) |

Apple does not publish RAM in the cited base iPad 10/A16 specifications. Do not copy unofficial RAM figures into the public page. Storage capacity and RAM are separate; the table's iPad Pro storage split identifies RAM configuration, not a MUTP storage requirement.

## Galaxy names need explicit qualification

Do not abbreviate the estimate to “Galaxy Tab S8 or newer” or “Galaxy Tab S9 series.” FE and A product names can look like successors while identifying different hardware. The cited S9 FE and S9 FE+ use Exynos 1380; S9 FE has 6/8 GB options and FE+ 8/12 GB. These are not the Snapdragon 8 Gen 2 flagship S9 models above. [Samsung FE announcement and specifications](https://news.samsung.com/us/samsung-galaxy-s23-fe-galaxy-tab-s9-fe-galaxy-buds-fe-bring-standout-features-to-even-more-users/)

Samsung's Tab A9/A9+ launch lists 4 GB and 8 GB memory configurations, subject to market variation. An 8 GB A-series model does not establish processor or GPU equivalence to an 8 GB flagship S-series device. Treat A-series and FE tablets as candidates for separate testing rather than promising the same animation tier; this is an evidence gap, not proof that they fail. [Samsung A9/A9+ announcement and specifications](https://news.samsung.com/global/samsung-galaxy-tab-a9-and-galaxy-tab-a9-entertainment-and-productivity-engineered-for-everyone)

## Suggested public wording

> **Planning for animated matches (estimates)**
>
> These are best-judgment estimates for future animated players, pitch and stadium, not tested minimums or a frame-rate guarantee. Try your existing device before considering an upgrade.
>
> **Desktop/laptop:** estimated starting point: a modern four-core processor, 8 GB RAM and hardware-accelerated integrated graphics. We recommend 16 GB RAM for more headroom; a dedicated graphics card is not part of this estimate.
>
> **iPad, in landscape:** estimated starting point: iPad 10th generation (2022, A14) or iPad (A16, 2025). For more headroom, we recommend an M1 or later iPad Air/Pro: Air 5th generation (2022), Pro 11-inch 3rd generation (2021), or Pro 12.9-inch 5th generation (2021) are the first examples.
>
> **Galaxy Tab, in landscape:** estimated starting point: flagship Tab S8/S8+/S8 Ultra (2022) with 8 GB RAM or more. For more headroom, we recommend flagship Tab S9/S9+/S9 Ultra (2023) with 8 GB RAM or more. FE and A models need separate testing.
>
> Keep your browser and operating system updated. Actual performance will depend on the final animations, browser and available memory. We have not physically validated Apple devices or benchmarked the future animation workload.

Link the public iPad and Galaxy model examples to the corresponding manufacturer sources above, and label performance values as project estimates. Do not turn a device's launch operating system into a MUTP minimum OS. This research does not establish current OS/browser support expiry dates or new browser exclusions.

## Validation needed before calling these tested requirements

Benchmark representative entry and headroom devices against the finished animated scene, including full player count, pitch/stadium motion, action menus, logs and replay controls. Measure steady frame delivery, memory growth and input responsiveness over sustained use; include high-density rendering, tab switching, reconnects and constrained-memory conditions. Emulation can validate layout and behavior but cannot establish physical-device GPU or thermal performance. Preserve separate layout-fit minima and known phone limitations from the existing layout evidence.
