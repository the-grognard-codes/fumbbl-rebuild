# Account-menu sign-out focus

Issue: [#386](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/386).

The moles-v0.1.8 PROD Hosting gate exposed a browser difference: disabling the
focused Sign out button clears focus in bundled Chromium before the auth observer
checks whether the account menu owned focus. The existing test at
`site/test/account-menu-browser.test.mjs:118` reproduced the failure locally with
Playwright's bundled Chromium; system Chrome passed.

Capture focus ownership before disabling the button and restore focus to Sign in
after successful sign-out. Preserve authentication, rejection handling, styling
and gameplay. Use the existing assertion unchanged as the regression check.

The owner authorized the issue, branch, commit/push, PR, CI-gated merge and both
Hosting deployments under a new immutable `moles-v0.1.9` tag. The prior tag stays
unchanged. Existing GCP backends already run the Java 21/browser-only package;
this fix changes only the static account menu.

Validation: run the unchanged account-menu test in bundled Chromium and system
Chrome, site checks/unit tests, PR Checks and the mandatory DEV/PROD browser
deployment gates. Before implementation, the isolated two-line proposal passed
the previously failing bundled-Chromium test without changing its assertions.

Implementation validation on 2026-10-30: the unchanged account-menu browser test
passed with both bundled Chromium and system Chrome after a fresh site build.
Site input checks, all 12 site unit tests and `git diff --check` passed. Self-review
confirmed that focus ownership is captured before disabling the button and is
restored only after successful sign-out; rejection handling is unchanged. PR and
release checks remain the publication gates.
