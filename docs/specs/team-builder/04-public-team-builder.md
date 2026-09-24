# 04 — Public team builder

## Outcome

`/teambuilder` becomes the signed-in React editor for account-owned, match-ready Human teams. It uses the existing authenticated v2 connection and server catalog instead of the standalone page's roster data and `localStorage` document.

## Work

- Add a public builder entry to the existing `browser-client` React bundle and mount it from the static site. Use the same Firebase identity and exact v2 transport configuration as `/play`; redirect an unsigned visitor through a constrained sign-in return to `/teambuilder`. Do not expose the local diagnostic credential form on the public page.
- Present only the server catalog's supported Human positions, purchased skills, resources and 1,150,000-gold preset. Support team/player names, distinct jersey numbers and roster ordering. Provisional cost/limit hints may come from catalog data, but the page must show server validation results as the acceptance decision and clear them after every edit.
- Create, list, load, edit and delete owned saved teams through the slice-02 contract. Make pending, stale-version, retired-catalog, lost-acknowledgement and authentication-loss states understandable without discarding unsaved edits or treating an uncertain save as accepted. Require an explicit confirmation before delete.
- Remove the standalone `teambuilder.js` rules/storage/import/export behavior and adjust the page copy. JSON file import/export, anonymous local drafts, Orc and freeform controls are absent. Preserve useful styling and accessible form behavior where it fits the new flow.

## Acceptance

- A signed-in player can build, validate, save, reload, edit and delete a named Human team through `/teambuilder`; an unsigned visitor cannot save or read account teams. A second account sees none of the first account's teams.
- The page never shows an edited draft as still validated, never claims an uncertain save succeeded, and never offers a retired catalog as match-ready. Reloading an owner-saved team uses the server document; old local storage or old JSON files are not consulted.
- The production site build serves the React entry and paired protocol decoder. Keyboard form controls, errors and status remain usable without the game board.

## Likely files and focused checks

`browser-client/src` builder view, v2 client/protocol types, `vite.play.config.ts` or a companion build entry, `site/src/teambuilder/index.html`, `site/src/assets/{login,complete}.js` and builder auth bootstrap, `site/scripts/{build,check}.mjs`, and site copy/styles. Use focused browser state/decoder checks, site build checks and a signed-in browser round trip against the local v2 server. No public deployment is included.
