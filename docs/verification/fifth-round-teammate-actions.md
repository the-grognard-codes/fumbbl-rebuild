# Teammate action evidence

Issue #188, fifth UI round T04. BB2025 declarations enter the existing activation sequence before any movement or teammate selection. Trait success, failure, reroll, later Always Hungry checks and throw/kick outcomes remain native decisions. Used activation skills prevent a second check during movement or the later special-action sequence.

The native test exercises six activation traits for both coaches and actions; movement into teammate adjacency; failed Bone Head and team reroll; rooted stationary actions; stationary pickup and legal landing range; pending-trait checkpoint round trips with runtime skill behaviors restored; and later Always Hungry checks. Each submitted action also checks wrong actor, stale revision and duplicate retry through SetupSession.

The browser journey checks both coaches and actions, visible local proposals, changing the teammate, cancellation, invalidated eligibility after a new revision, an ineligible teammate, one confirmed native selection, native landing selection and spectator inspection. Existing Pass and smart-pitch journeys cover the shared selection path. Browser fixtures establish presentation and submitted intent; the native tests establish gameplay.

Visual inspection of `.tools/fifth-round-evidence/T04/teammate-proposal.png` confirms that the proposal and Cancel teammate selection sit beside the existing Confirm control, within the MUTP command bar. The screenshot uses controlled data. Separate stadium work is baseline scenery, outside this slice.
