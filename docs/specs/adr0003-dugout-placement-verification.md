# Expanded dugout setup placement (#174)

https://github.com/the-grognard-codes/fumbbl-rebuild/issues/174

The dugout has three views: team name, state counts, and vertical player list. Up/down controls move between them. The expanded container accepts eligible own-team pitch players into reserves, including drops over its header or any state display. Reserve player buttons can be dragged onto legal pitch squares. Opponent, unavailable, altered-payload and collapsed-container drops are rejected. Native setup validation remains authoritative; no server gameplay changes are included.

Verified on an isolated branch based on main c899b5ae2:
- setup-drag-ui.mjs: both coaches, both directions, opponent and altered-payload rejection, collapsed-view rejection, and responsive fit at 1440x900, 640x330 and 375x300; existing keyboard/required-choice/Solid Defence checks pass.
- dugout-ui.mjs: exactly three independent states, vertical expansion, up/down controls and reserve selection pass.
- Browser unit suite: 156 passed.
- Site production build and check pass.

The first fixture run before the container fix failed because a drop over the dugout heading did not return the player to reserves. The updated fixture passes. This PR publishes #174 only; other fourth-round UI tickets remain open.
- Static-delivery CI identified a stale Restore selector in the result/replay fixture. Updated it to Expand; all five tests in m5e-result-browser.test.mjs pass locally.
