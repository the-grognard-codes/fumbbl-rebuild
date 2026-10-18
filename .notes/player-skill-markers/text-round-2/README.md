# Text marker readability and Big Guy filter review

Round 2 addresses the owner's feedback on three-letter readability and adds **Show Big Guy negatraits and Secret Weapon**. The first round is preserved for comparison. Nineteen samples now include the five additional requested traits needed to exercise the full filter; the complete manifest still contains 108 core identities.

## Settings behavior

Open **Game Menu → Skills & Traits → Skill Markers**. The new toggle is on by default and hides exactly these pitch marker identities when switched off:

- Bone Head
- Really Stupid
- Always Hungry
- Animal Savagery
- Unchannelled Fury
- Secret Weapon

**Loner remains visible.** Other traits, including Take Root and Animosity, are not part of this exact six-entry filter. The separate Show traits master switch still controls all traits, including Loner. Changing either setting does not overwrite the other. Choices persist after reload, broadcast to other views, and remain usable for the current session if storage is denied. Full player-card information is independent of marker visibility.

The controls are in the shared Game Menu and the preview consumes the same preferences and visibility helper. Production pitch markers and the rest of the planned marker settings are still awaiting feature integration; this preview demonstrates their filtering behavior without changing game mechanics.

## Readability and zoom

The first preview used fixed screen-pixel badges. Round 2 sizes them using each player's **projected square width**, so they grow with zoom and also reflect perspective distance. The selected Small/Medium/Large setting defines a relative baseline at a 64 px square, rather than a fixed screen size.

- Three-letter frames are about 22% wider: **88 × 96** instead of **72 × 96**, retaining a portrait shape.
- Three-letter MUTP lettering is taller, with mild horizontal condensation to fit the wider frame. It remains outlined vector artwork with no font dependency in exports.
- Normal strips stop shrinking below **14 px high**. Strips containing a visible three-letter abbreviation stop at **20 px**, keeping every card within that strip aligned.
- A 2.5× scale ceiling prevents excessive growth at very close camera settings. Small three-letter strips can match Medium at the floor; this is intentional.

The capture check measured the Ogre's Medium strip at **20 px** in overview and **28.125 px** in detail. Badges therefore resize above their floor; they are not fixed like round 1. These remain trial dimensions for owner review. Crowded placement still needs final collision behavior during production integration.

## Images

- [Revised specimen sheet](text-markers-contact-sheet.png)
- [New settings toggle](settings-big-guy-filter.png)
- [Six traits hidden while Loner stays visible](pitch-big-guy-traits-hidden.png)
- [Medium pitch](pitch-medium.png), [Small](pitch-small.png), [Large](pitch-large.png)
- [Overview zoom](pitch-overview-medium.png) and [detail zoom](pitch-detail-medium.png)
- [Crowded formation](pitch-crowded-medium.png)
- [Complete player list](pitch-hover-full-list.png)
- [Android landscape emulation](pitch-android-landscape.png) and [touch player card](pitch-android-player-card.png)
- [Original round for comparison](../text-round-1/README.md)

## Open the preview

```powershell
node browser-client/test/skill-marker-text-review-v2.mjs --serve
```

Open `http://127.0.0.1:5178/skill-markers-text-prototype-v2.html`. Use Game Menu for the filters, Overview/Detail or the mouse wheel for zoom, and the size controls for the relative scale. The original round remains on its own preview entry and asset directory.

Reproduce the assets and captures:

```powershell
python .notes/player-skill-markers/text-round-2/generate-samples.py
node browser-client/test/skill-marker-text-review-v2.mjs
```

The generator uses the existing MUTP font and `fonttools`, installed in this session's task dependency directory. All 19 identities are from the approved core inventory. The mutation/activation typography specimens use existing art as visual stand-ins rather than legal roster assertions. No player sprites or stadium paintings were edited.

## Verification

- Seven new focused tests protect exact six-trait filtering, Loner and unrelated traits, the master switch, persistence/defaults/storage denial, zoom sizing, and three-letter frame geometry.
- All **308 browser unit tests passed**: [log](browser-unit-test.log).
- Browser TypeScript/production build passed: [log](browser-build.log). Vite emitted a bundle-size warning.
- The round 2 capture driver passed: **19 SVGs, 76 transparent PNGs, 12 screenshots**, with no missing assets or browser runtime errors. It checks all six traits disappear, Loner remains, the preference survives reload, the master switch remains independent, zoom changes badge size, and touch player cards work: [report](capture-report.json).
- The shared Game Menu passed six-tab/four-viewport layout, typography, focus, persistence and short-screen scrolling checks: [log](menu-ui.log).
- Reconnect and pending-action recovery browser checks passed: [reconnect](reconnect-ui.log), [pending recovery](pending-recovery-ui.log).
- Playback browser validation passed for ordered moves, authoritative dice, seeking, reconnect snapshots, reduced motion, and required prompts: [log](playback-ui.log).
- `mvn -o -pl 'ffb-server,ffb-client-logic' -am test` passed for common, server, and client logic: **614 tests discovered, two skipped**, with zero failures/errors. The skipped cases require opt-in MariaDB targets. [Successful log](maven-test-unsandboxed.log).

The initial sandboxed Maven run failed because ClassGraph could not resolve the repository directory under sandbox filesystem restrictions; the identical rerun with filesystem access passed. No server fix was applied. Windows Chrome and Android touch emulation were checked; native Android and Linux were not run. Full production marker integration and end-to-end retained-match replay remain later checkpoints.

Tracking: [issue #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293). The owner approved round 2, specifically its improved three-letter readability, and authorized all remaining text markers. The [complete text pack](../text-full/README.md) is now ready for review; this round remains archived. No commit or push was made.
