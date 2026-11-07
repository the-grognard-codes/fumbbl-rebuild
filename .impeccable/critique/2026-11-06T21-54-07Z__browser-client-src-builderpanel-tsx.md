---
target: "Team builder (/teambuilder): element placement, task flow and scrolling"
total_score: 20
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\jaken\\Git-Hub\\fumbbl-rebuild\\browser-client\\src\\BuilderPanel.tsx"
target_fingerprint: "sha256:a897187429525cb7480b4eaa2a5ba320298478c856b6b8d200642f8fbe37ccae"
target_path: "C:\\Users\\jaken\\Git-Hub\\fumbbl-rebuild\\browser-client\\src\\BuilderPanel.tsx"
timestamp: 2026-11-06T21-54-07Z
slug: browser-client-src-builderpanel-tsx
---
Method: dual-agent (A: /root/impeccable_finish_reviewer; B: /root/impeccable_documenter). Independent assessments; native browser inspection ran sequentially in the user-opened Chrome window.

## Design specificity and overall impression

The builder clearly belongs to MUTP: the mole identity, player artwork, kit preview, navy framing and gold controls are specific to the game. Preserve that identity.

The main weakness is operational composition. The page stacks features instead of keeping a coach's roster-building decisions together. The biggest improvement would be a connected workspace with purchasing, roster consequences, budget and completion controls within reach.

The deterministic component scans returned **0 findings** across `BuilderPanel.tsx` and `BuilderDraftEditor.tsx`. The workflow findings below come from the independent rendered and source reviews.

## Design health

**20/40 — Acceptable, with substantial workflow improvements needed.** This is a provisional expert assessment of the inspected interface, not a usability study. All ten heuristics apply to this operational tool.

| Heuristic | Score | Main evidence |
|---|---:|---|
| Visibility of system status | 2/4 | Connection and validation messages exist; budget and completion state leave view during work. |
| Match with the coach's world | 3/4 | Familiar positions, treasury and resources; occasional implementation language intrudes. |
| User control and freedom | 2/4 | Reversible purchases and modal exits; source indicates unguarded draft replacement through New team/Load. |
| Consistency and standards | 3/4 | Cohesive identity and controls; primary actions are distributed across separate sections. |
| Error prevention | 2/4 | Position limits, number bounds and validated-save gate help; draft-discard protection is inconsistent. |
| Recognition rather than recall | 2/4 | Labels and counts help; resource purchasing requires recalling distant treasury information. |
| Flexibility and efficiency | 1/4 | Long traversal; returning-coach entry comes after the full editor. |
| Aesthetic and minimalist design | 1/4 | Optional kit controls precede recruitment; large repeated panels consume substantial height. |
| Error recovery | 2/4 | Source has duplicate-name and uncertain-save guidance; validation results are separated from the fields. |
| Help and documentation | 2/4 | Useful instructions and reference table; no unified completion guidance. |
| **Total** | **20/40** | **Acceptable** |

## What works

- Recruitment shows position costs, caps and current counts, supporting informed choices.
- Roster Value explains spending through a useful treasury breakdown when visible.
- Team Details already provides effective progressive disclosure; opening and closing it worked during live inspection.

## Priority issues

### 1. P1 — Purchasing and budget context are separated

**What:** Recruitment, the editable roster and resource purchasing are separate destinations. Wide layouts put recruitment and value beside each other, but resources remain farther down; the value summary does not stay visible there. Narrow layouts stack all these sections.

**Why:** Coaches must travel between a purchase, its effect on the roster, and the remaining treasury.

**Fix:** Build one connected roster workspace. Co-locate recruitment and recruited players, keep a compact player/treasury/skill summary visible, and put resources beside their spending context. Use compact recruitment rows while preserving portraits, labels and usable controls.

**Suggested command:** `$impeccable layout`.

Sources: `browser-client/src/BuilderDraftEditor.tsx:89`, `:99`, `:110`, `:127`; `site/src/assets/builder-layout.css:11`.

### 2. P1 — Validation and saving are separate destinations

**What:** Validate Roster sits above the roster. Resources and deployment formations intervene before validation results and Save team.

**Why:** The coach cannot see the completion sequence and current dependencies together. Changes clear validation, while the next required action may be elsewhere on the page.

**Fix:** Use one completion area containing validation, status, errors and saving. Keep it reachable while editing, link errors to their fields, and move optional formations outside the main completion path. Preserve server validation and the existing draft-version save gate.

**Suggested command:** `$impeccable layout`, followed by `$impeccable harden` for error navigation and recovery.

Sources: `browser-client/src/BuilderDraftEditor.tsx:110`; `browser-client/src/BuilderPanel.tsx:153`, `:158`, `:159`.

### 3. P2 — Optional customization takes prime working space

**What:** Both kit palettes appear before recruitment. Expanded Team Details inserts another substantial section between customization and recruitment.

**Why:** Optional setup occupies the route to the essential task. In the inspected narrow opening, there was no recruitment action in view.

**Fix:** Start with a compact kit preview and a Customize kit disclosure. Reuse the existing reference-table disclosure pattern. Show the fixed creation mode as budget context rather than a disabled selector.

**Suggested command:** `$impeccable distill`.

Source: `browser-client/src/BuilderDraftEditor.tsx:79`.

### 4. P2 — Returning-coach entry is at the bottom

**What:** Your Teams, Load and New team follow the entire editor. In B's maximized-window inspection of an empty draft, Save team and Your Teams first appeared after six native scroll commands. Those are input counts, not measured CSS distances.

**Why:** Returning coaches must pass through the new-team workflow before reaching their actual starting point.

**Fix:** Offer New team / Your teams at entry, then open the selected team's workspace directly. Keep account-team management separate from the current draft's editing controls.

**Suggested command:** `$impeccable layout`.

Source: `browser-client/src/BuilderPanel.tsx:166`.

## Cognitive load and emotional journey

The synthesis identifies **5/8 checklist concerns**: single focus, hierarchy, doing one task at a time, working memory and progressive disclosure. Local grouping and chunking are useful. The six positions, five resources and 16-color palettes are legitimate domain choices; their quantity alone is not a defect. The avoidable burden is exposing optional choices before essential work and separating decisions from their consequences.

The artwork creates a welcoming start. Confidence then drops as roster decisions, totals and completion move into different scroll regions. A visible working summary and clear completion path would make the end of the task more reassuring.

## Persona red flags

- **Experienced coach:** repeatedly travels between purchases, roster consequences and treasury.
- **First-time MUTP coach:** can mistake colors and formations for required steps before the first saved team.
- **Keyboard or assistive-technology user:** repeated roster controls and a distant completion area may create a long journey. Complete keyboard and screen-reader operation were not exercised.

## Minor observations

- Source indicates New team and Load can replace unsaved input without the confirmation used when switching roster type. This was not reproduced through live draft changes.
- Replace implementation-oriented introductory language such as server catalog with coach-task language when refining the layout.

## Evidence and limits

Both assessments inspected the signed-in, Connected local builder with an empty Human draft, zero resources, disabled Save and existing saved-team rows. Team Details was opened and closed. Native captures included approximately 516×562 and 1280×752 Chrome windows; these include browser controls, and CSS viewport dimensions were not measured. The first narrow opening showed the header, introduction, status and the beginning of Team Options.

Populated-roster editing, validation results, saving/loading, the formation dialog, complete keyboard journeys and physical phone use were source-reviewed or unverified, not exercised live. No builder source or persisted team data was changed.

## Questions to consider

1. Which structure should lead: a compact workbench with recruitment, roster and budget together, or a guided sequence of steps?
2. Should the first implementation cover the two P1 issues only, or all four priorities including customization and returning-coach entry?
