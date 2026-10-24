# Limited action tag visual review (throwaway)

Selected treatment: **gold icon with the black circular fade**, centered above the
player's head (`gold-fade`). The user approved the icon artwork and selected this
treatment after comparing the circular-border alternative. Production integration and its gameplay/replay/recovery validation are recorded in
[the outcome report](../../../docs/specs/limited-use-action-tags-outcome.md).

Current question: which border/backing reads best with the approved gold icons centered
above the player's head?

From `browser-client`, run `npm run mockups:limited-actions`.
In Windows PowerShell with script execution disabled, use `npm.cmd run mockups:limited-actions`.

- B / Gold circular border: http://127.0.0.1:5182/pitch-preview?variant=gold-circle
- C / Gold icon with dark circular fade: http://127.0.0.1:5182/pitch-preview?variant=gold-fade
- A / Original gold reference: http://127.0.0.1:5182/pitch-preview?variant=gold
- D / Original white/light-blue reference: http://127.0.0.1:5182/pitch-preview?variant=ice

Switch treatments without changing the snapshot. Compare normal, overview and close scales;
both pitch ends; perspective and top-down; threat and skill overlays; prone, stunned,
distracted and off-pitch examples. The full nine-action catalog shows 24px badges next
to enlarged 44px details. On-pitch badge size follows the projected square with an
18px legibility floor and 30px ceiling.

The study reuses the real pitch projection, turf, player poses, skill badges and action
atlas. Only badge tint, backing, border and placement are proposed. No new player art.
Snapshots and the ball-possession highlight are illustrative. They do not demonstrate
server consumption, legal action combinations, movement, cleanup, replay or recovery.
No match server, account, database or persistence is used. No production route changes.

The user selected the gold palette and approved the icon images, then requested two
further views: a circular border and an icon-only dark circular fade. Both center the
action badge independently of the skill strip, just above the visible player artwork;
the badge can overlap the skill strip by three pixels. Existing icon images, glyph
size and gold tint are preserved. The fade has no visible border, tile or pointer.
Original gold and white/blue views remain available as references. This scoped request
overrides the prototype skill's default of structurally different UI variants.
The existing local `/pitch-preview`
prototype convention is reused to avoid connecting visual experiments to live play.
The user approved the production integration and subsequently authorized publication.

## Review captures and checks

The `review/` directory contains all complete desktop candidates, pitch-only captures,
status examples, no-skill views, adjacent-player close-ups, an away-end top-down example and
phone portrait/landscape captures. Recreate them with the local server running:

```sh
node prototypes/limited-actions/capture.mjs
```

The capture run passed 27 Chromium checks: 22 loaded player poses, four pitch tags,
nine catalog entries, prone/stunned/distracted tags in all four treatments, action
horizontal centering independent of skill visibility in the two new views, off-pitch hiding,
visibility toggling, responsive page overflow, keyboard controls, URL selection and
reload behavior. There were no page, HTTP, image or font errors. See `review/checks.json`.
The prototype also passed strict TypeScript checking and `git diff --check`.
Phone layouts use responsive browser emulation on Windows; physical Android devices
and Linux were not exercised. Narrow previews preserve a 720px pitch surface with
horizontal touch scrolling rather than shrinking badges over the player art.

Gameplay unit tests, server builds, live play, replay and recovery are outside this
appearance-only prototype. The production implementation and its completed checks
are documented in the linked outcome report.
