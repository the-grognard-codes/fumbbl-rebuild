# Production implementation

Approved scope: [design/spec](../../../docs/specs/revised-skill-prompts.md).
Implementation issue: [#361](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/361).
Validation and remaining gaps: [outcome](../../../docs/specs/revised-skill-prompts-outcome.md).

The prototype is a design reference. Production uses `CircularSkillPrompt`,
the existing physical dice overlay, and browser-owned native reroll policy;
it does not mount this prototype's state simulator in a match.
