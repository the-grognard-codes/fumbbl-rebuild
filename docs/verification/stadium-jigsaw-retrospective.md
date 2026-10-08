# Stadium jigsaw revision retrospective — interim

Date: 2026-10-08. Workstream: [#211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211), [draft PR #214](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/214).

The original functional framework was delivered, but the owner rejected its assembled stadium and crowd. The earlier retrospective overstated visual and intent alignment. This revision replaces small repeated crowd cards with large authored banks and corners and restores a packed foreground bowl. Local integrated verification is complete (229 units, 23 interaction drivers, 18 asset checks, TypeScript and build); the final authenticated native rerun and merge remain open because the DEV Google Cloud session expired. This is an interim audit, not an all-slices completion report.

## Sources and intended outcome

The [original League MVP plan](../specs/league-stadium-mvp.md) records venue ownership, Human/Orc art direction, layered assets, shared camera geometry and future League support. The [earlier retrospective](league-stadium-mvp-retrospective.md) records the initial merged slices. Later owner feedback supersedes its near-stand cutaway, small fan groups and 1.5-square margin.

The [current bowl decision record](../specs/modular-stadium-bowl.md), [approved image and detailed brief](../../assets/game/references/stadiums/human-reference-revision/README.md), and current conversation require a continuous stone/timber bowl, dense standing spectators looking inward, raised near backs hiding most of the near wall, exactly two sideline locker-room entrances, benches beside them, two squares of apron, mixed supporters split at physical midfield and compatible jigsaw pieces. Animation should trigger randomly by section and affect only a few spectators.

## Outcome against requirements

| Requirement | Current outcome and evidence | Assessment |
| --- | --- | --- |
| Unchanged pitch and input | Existing 26 × 15 projection and 390 cells; coach targeting, drag/pan/zoom, kickoff and dice regressions pass | Functional requirement met locally |
| Common stadium dimensions | Ten physical slots cover the 38 × 27 bowl outside the 30 × 19 apron; Human/Orc use identical slots | Met; catalog and geometry checks protect compatibility |
| Venue and crowd ownership | Home League chooses structure; participating teams choose supporters, benches and flags; both hosting assignments and coach ends tested | Met locally; final native rerun open |
| Continuous packed bowl | Large side/end/corner paintings replace cards and empty terrace bands; near backs cover most of their retaining wall | Substantially closer to the reference; [assembled evidence](../../assets/game/references/stadiums/human-reference-revision/jigsaw-review/README.md), owner acceptance not claimed |
| Entrances and benches | Two sideline doors at north x=6 / south x=20; field-level bench bays connect to the apron, with low retaining lips and returns | Implemented; corrected after independent review |
| Mixed crowds and dividers | Home/away long-side halves meet at x=13; two timber partitions cross only stand depth | Met locally; assignments remain stable in acting-team/half-two fixtures |
| Appropriate camera views | Dedicated inward profiles/front/back and overhead sheets; both ends, 30/40/50/90 degrees and full travel | Local renderer matrix passes; actual native final matrix pending |
| Restrained animation | Random 3.5–15.5 second gap, one eligible section, two-second local burst; still base art, independent fire/flags | Motion/reduced-motion checks pass; missing gestures disable only the failed file |
| Future League authoring | Source originals, hashes, measured roles, shared geometry, prompts, mappings and camera review tool documented | [Authoring contract](../../assets/game/pitch/stadiums/jigsaw/source/README.md) supplies the reusable framework |

The Human masonry and timber follow the supplied reference. Orc materials retain olive skin, dark hide/russet cloth, battered warm stone and heavy iron/timber, informed by Vanilla Barrens/Orgrimmar. These are original project assets. Built-in image generation produced the selected PNGs; exact prompts and parent-edit records are retained beside the catalog. Original PNG bytes are preserved without image resampling or re-encoding.

## Why the first result missed intent

The renderer proved geometry and identity, then treated that evidence as proof of composition. Small reusable fan cards, terrace bands and a near-end cutaway met portions of the earlier technical plan while losing the owner's standing-room-only bowl. Reviewing source atlases or schematic geometry could not reveal the full mismatch.

The revised acceptance unit is the assembled production view: the same pitch camera, native scale, both ends and near/middle/far positions. Source compatibility, behavior tests and visual judgement remain separate. Independent review caught furniture elevated above its entrance, larger end-bank faces at corner joins, and an overly broad bench mask. Both Standards and Spec approved the integrated code at a0924c1a0 after those findings were corrected. Lowered furniture needed open bays and retaining returns; denser authored ends resolved scale without flattening faces or sacrificing near-wall occlusion.

## Environment improvements, by severity

1. **Visual review boundary.** Keep the assembled reference gallery beside the originating brief and inspect it before publication. The new capture tool renders the actual LivePitch. Automated geometry cannot substitute for judging density, head scale, seams, silhouette and material treatment.
2. **Mechanical guards.** Existing CI already runs assets:check, browser units, TypeScript/build and interaction tests through site test:browser. This revision extends those checks with exact jigsaw roles/dimensions/hashes, nonoverlap, local gesture zones, fixed slot coverage, low bench lips and an optional-gesture failure regression. The environment had guardrails; visual criteria were outside them.
3. **Native authentication preparation.** Preflight the credential actually mounted by the isolated server before starting a long native run. The review and acceptance containers used different ADC sources during recovery; both eventually expired. Preserve sanitized error codes and pause authenticated work for owner reauthentication rather than changing product authentication.
4. **Navigation.** The current brief links directly to the catalog, authoring contract, gallery and verification report. Keep future stadium work routed through those references; player-sprite instructions address a different asset family.
5. **Projection consistency.** Affine and registered surfaces now share world-plane projection and CSS crop output. Equivalent-source and viewport-clipping tests prevent camera corrections from diverging between props and jigsaw paintings.
6. **Tool economy.** Use targeted file reads and saved scripts for large source/prompt updates. Oversized shell commands, repeated capture runs during file edits, and full prompt-document output added avoidable overhead. Batch independent read-only checks, then freeze files for each final capture/test run.

No additional always-loaded AGENTS rules are needed. The useful instructions belong in the stadium authoring reference, and mechanical invariants belong in the existing checks.

## Additional CI finding

Java 21 CI exposed an intermittent recovery-fixture failure after the main integration: random Sweltering Heat could leave exhausted players on the roster, while the test helper tried to place every player. Forcing the weather reproduced the failure deterministically. The helper now follows native setup eligibility; the test asserts exhausted players are present and still checks cross-JVM, halftime and completed-match recovery. All six recovery scenarios pass locally, and both review axes approve the correction. Product rules were not relaxed.

This reinforces the verification lesson: fixtures must preserve the engine's availability rules across drive boundaries. A passing isolated run is insufficient evidence for a failure controlled by random weather. Required final-head CI remains a merge condition.

## Remaining completion conditions

Refresh the local DEV ADC login; rerun authenticated Human-home and Orc-home camera/reconnect/replay journeys against the final code; resolve any fresh findings; require CI on the published head; then merge the renderer slice and update this audit to final.

No full native match was played through halftime. Fixture tests establish stable section ownership there. Motion observations are short headless checks, not sustained GPU or network performance benchmarks. The full original PNG set is about 24.7 MB across both families/views/gesture frames; shipping-size optimization remains separate work.
