# Removed constrained Pass Block routing

The independent spec review identified remaining unused machinery after the old
RoutePlanner branch was removed. This is historical removal evidence.

- Renamed `PathFinderWithPassBlockSupport` to `PathFinder` and updated the
  sole active caller, `StallingExtension`. Removed `allowPassBlockMove`, its
  endpoint context and the unreachable jump branch. The surviving normal path
  uses exactly its former settings: block tackle zones and ball traversal, do
  not jump, and do not exit the opponent end zone while holding the ball.
- Removed `UtilPassing.findValidPassBlockEndCoordinates` and its private
  `findInterceptCoordinates` helper. The only remaining endpoint-set caller
  computed an argument that BB2025 ignored. Regular interception geometry is
  retained.
- Removed ignored reachability/from/to/endpoint/jump parameters from the
  `OnTheBallMechanic` contract and updated current implementation,
  `StepPassBlock`, `UtilServerPlayerMove` and the existing mechanic test.
  The rule remains `distance + actingPlayer.getCurrentMove() <= 3`.
- Kept `PathFinderWithMultiJump`, `PathFindContext`, and shared node/state
  classes: current BB2025 theoretical movement still uses them.

Checked all existing tracked and untracked Java files for old class/helper names
and old method call signatures; no surviving Java references remain.

`git diff --check` passed. No Maven/test command was run in this slice, as the
parent owns full reactor validation. The existing focused selector is
`OnTheBallMechanicTest` (three-square and accumulated-move boundaries, eligible
player selection, descriptions). No existing direct normal-pathfinder or stalling
unit test was found. Added `PathFinderTest` using the real field geometry to protect
remaining-movement limits, occupied-square avoidance, and entering versus crossing
tackle zones. The parent will run it together with the full validation.
