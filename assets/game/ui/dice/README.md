# Ivory and cyan dice

The playable browser client uses the approved ivory-cyan blank die body with exact native block outcomes and d6 pips drawn as crisp SVG overlays. The body is promoted unchanged from `docs/adr/references/0003-angled-pitch-v4/dice/art/ivory-cyan-v1.png`; `provenance.json` records its SHA-256. The approved 768 × 128 block and d6 sprite strips are retained here as the canonical face exports.

Block faces follow native order: **Skull, Both down, Push, Push, Stumble, Pow**. The two Push faces are intentionally identical. Stumble is the native `POW/PUSH` face. The d6 contains exactly one through six pips. Face marks are overlaid on the blank body so generated pixels never determine a result.

The client accepts only reported or server-offered face identities. A supplied roll key plays one 440 ms spin with at most 3 px of movement; it does not cycle faces or generate random results. Reduced-motion users see the settled face immediately. Unknown face values leave the blank body neutral.

The reference study and its deterministic preview are at `docs/adr/references/0003-angled-pitch-v4/dice/`.
