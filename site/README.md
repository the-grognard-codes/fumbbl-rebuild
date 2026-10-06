# Moles Under the Pitch public site

This is a dependency-free static project site. It includes the public project page,
updates, privacy policy, support contact, non-affiliation statement, and Firebase
Authentication sign-in/completion routes. Their public configuration is generated
only by the explicitly selected Firebase assembly environment.

`/spectate` lists authenticated live matchups with public team and score details.
Its replay archive is an empty search scaffold for game IDs, players/coaches,
team names and team types. Play setup retains a link to this game browser.
Run `npm run test:spectate --prefix site` for the focused browser checks.

Run `npm run check --prefix site` to validate its required pages, or
`npm run build --prefix site` to create `site/dist/`.

The Updates history lives in `site/updates.json`, with one concise entry per
merged PR, its GitHub URL and merge timestamp, ordered newest first. Add merged
work there and run `npm run updates:render --prefix site` to regenerate the
static page. Dates use America/New_York. The page offers search, category filters
and ten entries per page; the full history remains available without JavaScript.
`npm run check --prefix site` checks that the generated page matches the entries.
Run `npm run test:updates --prefix site` for the focused browser checks.
