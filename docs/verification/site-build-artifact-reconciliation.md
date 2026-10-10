# Public-site build artifact reconciliation

Scope: [#245](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/245).
Branch: `chore/reconcile-site-build-artifacts`, base `72ea9903e`.

The remaining eight modified files in `site/dist/` matched the already committed
site source and shared header renderer. All twelve tracked files in that output
directory, including the four unchanged files, can be recreated by the site build.
No additional source feature needed reconciliation.

Removed those twelve files from the Git index with `git rm -r --cached -- site/dist`.
Their local copies remained unchanged, and the existing `site/dist/` ignore rule
now applies to the whole directory. The site README documents the tracked inputs,
generated output, and Firebase Hosting assembly sequence.

The stadium TypeScript file marked modified during review was byte-identical to
HEAD. Refreshing its index metadata removed the dirty status without a content
change. Tracked browser asset snapshots and historical verification evidence
remain outside this cleanup.

Verification:

- `npm.cmd --prefix site run build`: passed asset synchronization, TypeScript,
  Vite, and static site generation. All twelve formerly tracked artifacts were
  recreated byte-for-byte, checked against SHA-256 hashes recorded before cleanup.
- `git ls-files site/dist`: empty after the build; `git check-ignore` confirmed all
  twelve recreated files are ignored.
- `npm.cmd --prefix site run check`: passed 17 site inputs and 105 PR updates.
- `npm.cmd --prefix site test`: all ten unit tests passed.
- `node --test site/test/account-menu-browser.test.mjs`: passed shared headers,
  authentication reuse, account actions, keyboard behavior, and responsive bounds.
- `git diff --check HEAD`: passed.

No Java code, build definitions, dependencies, or player-visible behavior changed.
