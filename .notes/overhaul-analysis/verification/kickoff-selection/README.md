# Kickoff selection capture

`kickoff-player-selection.png` shows the hosted match at 1280×660 after selecting two players. The browser protocol fixture returns revision-bound server action IDs and mirrors the engine's `event-pick` / `event-confirm` shapes. The test clicks one player to select, clicks again to deselect, then selects two and confirms. It checks every submitted action ID and expected revision.

The screenshot verifies the ribbon layout and selected state. It is a browser fixture, not evidence of a live native kickoff sequence or a dev-local deployment.
