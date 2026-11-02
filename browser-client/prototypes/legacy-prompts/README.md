# Decision prompt visual review — throwaway prototype

Latest: [mole vs goblin comparison](review/mole-comparison.html), with Heads/Tails labels restored. Horizontal preview defaults to mole medics/referee; add art=goblin to a preview URL for original goblins. Reusable art and exact prompts are saved in [the repository template kit](../../../assets/game/references/mutp-chibi-template-v1/TEMPLATE.md).


Revision 2: horizontal selected. Open [the revised horizontal gallery](review/horizontal.html). Vertical views remain unchanged. New illustrations and prompts: [art/PROVENANCE.md](art/PROVENANCE.md). Inducement icons/player portraits reuse existing components. Refresh horizontal captures with `node prototypes/legacy-prompts/capture.mjs --horizontal`. Production work remains paused for revised visual approval.


Question: should the selected rectangular prompts use horizontal option rows or vertical stacks?

Run from browser-client:

```powershell
npm.cmd run mockups:legacy-prompts
```

Open http://127.0.0.1:5187/pitch-preview?variant=horizontal&scenario=coin . Use the bottom bar to switch orientation and the top dropdown to select a prompt. Candidate selection is local; Confirm records the simulated choice in the state readout. Drag the pitch to pan; zoom controls operate only on player-focused prompts. No server calls, native game mutations, persistence or real deadlines.

Static paired image gallery: [review/index.html](review/index.html). All seven included cases have horizontal and vertical PNGs. Additional captures show off-pitch bribes and narrow interception/multiple-apothecary layouts. New SVG choice art is review-only code in Mockups.tsx, extending existing injury badge styling; production extraction/provenance follows approval. The existing apothecary/injury SVG is referenced unchanged. Existing pitch and team sprites are reused unchanged.

The prototype demonstrates shape, assets, local candidate selection and camera anchoring. Fixture placement is not the future collision solver; offscreen anchoring is omitted, and constrained screens may overlap nearby players. Browser V2 gameplay, live-play/replay/recovery, server sequencing and native OS compatibility have not been validated by this prototype.

Reproduce evidence:

```powershell
npm.cmd exec tsc -- --project prototypes/legacy-prompts/tsconfig.json
node prototypes/legacy-prompts/capture.mjs
```

Owner gate: choose A (horizontal) or B (vertical), with requested visual changes. Do not promote the prototype directly into production. See [.notes design](../../../.notes/legacy-decision-prompts/design.md) and issues #414–#417.
