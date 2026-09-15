# Moles Under the Pitch import manifest

## Source

- Repository: `https://github.com/the-grognard-codes/moles-under-the-pitch-dot-org.git`
- Commit: `e2dc831ad710cc227589e269637d31d230b7fb30` (`main`, resolved 2026-09-14)
- Staging input: `import-moles-under-the-pitch/`, 102 files at classification time.
- Nested Git directories: none were present. Any nested `.git/` directory is excluded from imports.

## Retained and classified content

| Staged path | Destination or disposition |
| --- | --- |
| `public/grognard-avatar.jpg` | `site/src/assets/grognard-avatar.jpg` |
| `public/grognard-troll-slayer.jpg` | `site/src/assets/grognard-troll-slayer.jpg` |
| `public/index.html`, `public/style.css` | Factored into the independently buildable `site/src/` public pages and `site/src/assets/site.css`; the new pages add project updates, privacy, support, and non-affiliation content. |
| `README.md` | Source/deployment context incorporated in `deployment/firebase/README.md`. |
| `firebase.json`, `.firebaserc` | Replaced by repository-root generic Hosting configuration and dev/prod alias placeholders. |
| `.github/workflows/firebase-hosting-*.yml` | Replaced with repository workflows for checks, dev deployment, and release-only production deployment. |

## Intentional exclusions

| Staged paths | Reason |
| --- | --- |
| `public/auth.js`, `public/firebase-config.js` | Original code was not retained. Part 2 adds a separately designed build-time public configuration and environment-isolated Firebase Authentication flow under `deployment/firebase/` and `site/src/login/`; it does not use the original placeholder configuration. |
| `generate_avatar.js` | One-off generator without a retained build contract; its generated images are retained above. |
| `.firebase/hosting.cHVibGlj.cache` | Generated Firebase CLI cache. |
| `.agents/**` (87 files) and `.claude/**` | Imported assistant tooling, not product or deployment source. |
| `skills-lock.json`, `.gitignore` | Staging-only metadata superseded by this repository’s controls. |
| `.git/**` | Explicitly excluded; none existed in the supplied staging tree. |

After this manifest and the retained files are verified, the temporary staging directory is removed. No source credentials, OAuth secrets, service-account keys, or production project settings are retained.
