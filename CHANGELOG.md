# Changes

## Unreleased

- Signing out from the account menu reliably returns keyboard focus to Sign in,
  including browsers that clear focus when the Sign out button is disabled.

- All Java modules now require Java 21 or newer and compile for Java 21. Build,
  bootstrap, CI and setup use one Java 21 toolchain; historical documentation and
  stored-match compatibility boundaries remain preserved.

- MUTP supports browser clients only. Browser V2 is the standard server runtime;
  V1 remains development-only diagnostics. Retired clients and their exclusive
  server services, distribution and operational workflows have been removed.
  Existing browser behavior and game rules are preserved. Historical games and
  replays from retired clients are not supported.
