# M5b route checkpoint

Status: implementation candidate, 2026-09-25.

`/play` now owns team selection, invitation preparation and active-game browsing. `/play/match?matchId=<uuid>` owns the existing `GameView` for pre-match choices, setup, live play and full time. Spectator entry uses `&watch=1`. The activation response must report `ACTIVATED` before either player navigates; a notification reload can deliver that confirmation to the other participant. Browser history navigation is a full page load, so each surface owns one authenticated `V2Client` rather than competing subscriptions. The match route seeds the same client with its validated match/role selection, allowing direct links, reload and reconnect to request a fresh authorized state. Retained uncertain setup intent selects its original match and blocks new mutations until explicit exact retry.

Signed-out direct links store only the validated same-site route for the existing `/play` login return; no token or provider identity enters the URL. The existing Firebase `/play/**` rewrite serves deep links. The DOM `GameView` and all setup/action controls remain the working baseline for M5c/M5d.

Evidence: browser protocol tests cover initial spectator selection, single reopen on reconnect, read-only behavior before the first returned frame, and retained setup retry across reload. Hosted browser tests cover both participants entering after activation, spectator entry, direct-route reload and reconnect. Site tests cover the constrained sign-in return. `npm test` and `npm run test:browser --prefix site` provide the affected checks. No server DTO, engine, replay, or database change is needed for this slice.
