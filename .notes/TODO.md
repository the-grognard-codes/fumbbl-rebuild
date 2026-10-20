A separate app or tool that allows users to build teams for use in exhibition play.  They can create a roster for use in one time league matches or to test specific builds.  This also will act as a scaffold for testing the client / server locally.

Future team-builder factory requirements:

- Generate editable, race-appropriate player names when recruiting a player. Each roster definition should reference its shared name pool and any positional specialist pools, alongside its other creation metadata.
- Human: share 1,000 Human names across Blitzers, Catchers, Throwers and Linemen; provide 100 Ogre names and 100 Halfling names.
- Orc: share 1,000 Orc names across Blitzers, Big 'Uns, Throwers and Linemen; provide 100 Troll names and 100 Goblin names.
- Generated names use only ASCII letters (`A-Z`, `a-z`), start with a capital, and contain at most 12 letters. Avoid names already present on the roster, ignoring case. Coaches can replace generated names manually; preserve those choices when saving and loading.
- Reuse the checked-in pools in `browser-client/src/player-name-pools.ts` when consolidating roster metadata into the factory. Extend the same approach for each future roster and its specialists.
- Keep team names unique within each account when creating, copying or renaming a saved team, including concurrent requests. Saving as a new team must preserve the source document.
