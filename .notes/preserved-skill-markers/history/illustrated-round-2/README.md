# Illustrated markers: deeper colors and simpler symbols

The owner approved a **20px illustrated minimum**, modestly deeper category panels, and fewer interior details. This second review round revises the same nine candidates. The text pack and first-round images are preserved. Production pitch integration and expansion to the remaining illustrated identities still await review.

## Review

- [Before/after candidate board](illustrated-candidate-board.png): both rounds at equal large sizes and at the same 20px height.
- [Standalone gallery](review.html), which opens directly from disk without starting debug services.
- [MUTP specimen sheet](illustrated-contact-sheet.png).
- Pitch: [Small](pitch-small.png), [Medium](pitch-medium.png), [Large](pitch-large.png).
- Zoom: [Overview](pitch-overview.png), [Detail](pitch-detail.png).
- [Crowded spacing](pitch-crowded.png), [complete player card](pitch-player-card.png), [Big Guy filter retaining Loner](pitch-traits-filtered.png).
- [Android landscape emulation](pitch-android-landscape.png).
- [First round](../illustrated-round-1/README.md).

## What changed

The illustrated sizing path now has a **20px floor at every selected size and camera distance**. At a baseline 64px player square, Small and Medium both render at 20px; Large renders at 24px. Above the floor, each setting still scales with projected player size and retains its different relative baseline. Large can also reach the 20px floor when zoomed out. The capture measured Medium at **20px in overview** and **28.125px in detail**.

The shared `markerStripMetrics` helper accepts an illustrated style, using the 20px minimum and a consistent 72:96 portrait ratio regardless of shorthand length. Existing callers default to text. Text keeps the original lighter palette, 14px ordinary floor, 20px three-letter floor, and wider three-letter frames. No production pitch renderer is added by this artwork round.

Illustrated palette targets:

| Category | First round | Deeper target |
| --- | --- | --- |
| General | `#49DFFF` | `#25B9DC` |
| Agility | `#FFE17B` | `#E9BF43` |
| Strength | `#E4777F` | `#C94F5C` |
| Mutation | `#B696DE` | `#9268C3` |
| Passing | `#7AC59C` | `#4D9F76` |
| Devious | `#E7AA6A` | `#CE853B` |
| Traits | `#10141A` | `#10141A` |

The original category hues and pale edges remain recognizable. Generated panels retain some shading, so these are prompt targets rather than a claim that every background pixel equals the hex value. The deeper palette applies only to illustrations; the approved text fills remain unchanged.

All nine symbols have fewer interior edges:

- Block loses rivets and straps; Dodge loses small armor plates and extra motion lines.
- Mighty Blow uses a simplified fist and three large impact rays; Claws uses three clean hooked shapes without knuckle segments.
- Pass uses two broad laces and one throwing arc.
- Dirty Player reduces to a boot, three large studs, and a simple prone helmet, without facemask bars or a body.
- Bone Head loses facial creases and small teeth.
- Loner becomes a lone helmet inside an open ring, removing the background teammates and chest armor.
- Secret Weapon keeps its cloak-and-hidden-weapon identity with fewer cloth folds.

The 20px specimens are clearer than the first round's 16px minimum, but symbol recognition remains a visual-review decision. No numeric or target variants were added. Secret Weapon remains distinct from the separate Chainsaw identity.

## Assets and prompts

[samples.json](samples.json) records selected sources, palette targets, and core identities. The pack has nine **216 × 288** PNG masters and three runtime export sizes per identity: Small **15 × 20**, Medium **15 × 20**, Large **18 × 24**. All 36 exports have transparent clipped corners. Small and Medium coincide only at the floor/baseline; rendering continues to scale above it.

Used the **built-in image_gen tool** under the [imagegen skill](C:/Users/jaken/.codex/skills/.system/imagegen/SKILL.md). [The nine editing prompts](prompts.json) reference first-round sources. [Mighty Blow's repair prompt](mighty-blow-repair-prompt.json) records an opaque-master repair after export checks caught an interior alpha-extraction artifact. Sources are preserved; normalized exports use the standard portrait crop and corner clip. No Python raster editing or API-key fallback was used.

## Checks performed

```powershell
node --experimental-strip-types --test browser-client/test/skill-marker-presentation.test.ts
node browser-client/test/skill-marker-illustrated-review.mjs --round=2
```

Five focused tests passed, covering the six-trait filter/Loner exception, existing text sizing, the illustrated floor at all sizes and zooms, and proportional growth above the floor. The [capture report](capture-report.json) records nine manifest-matched identities across seven categories, 36 PNG exports with valid dimensions/corners/panels, eleven review images, twelve player sprites, overflow, full player-card information, the Big Guy filter retaining Loner, touch cards, and zoom growth. Every settled pitch view checks every rendered illustrated marker remains at least 20px high. The before/after gallery passes a 390px overflow check. Browser runtime and missing-asset errors: zero.

- `npm.cmd test`: **309 passed**, none failed or skipped. [Log](browser-unit-test.log).
- `npm.cmd run build`: TypeScript and production bundling passed; Vite emitted its existing bundle-size warning. [Log](browser-build.log).
- Reconnect, pending-action recovery, and playback browser checks: [reconnect](reconnect-ui.log), [pending recovery](pending-recovery-ui.log), [playback](playback-ui.log).
- `mvn -o -pl 'ffb-server,ffb-client-logic' -am test`: common/server/client-logic tests and compilation passed with the installed Temurin 21 JDK; two opt-in MariaDB cases skipped. [Log](maven-test.log).

Candidate board, overview and touch captures were visually inspected. Windows Chrome and Android emulation were used; native Android/Linux were not run. Capture servers close when checks complete. The managed debug stack was not restarted, redeployed, or stopped again. Unrelated working-tree changes were preserved. No commit or push was made.

Tracking: [issue #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293). This revised batch awaits owner review before more illustrated assets are generated.
