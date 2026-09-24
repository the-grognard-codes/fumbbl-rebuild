# Active match publication owns live viewers

Status: accepted on 2026-09-23. Refines ADR-004 in `.notes/overhaul-analysis/04-technology-and-decisions.md`.

The `/browser/v2` publication module owns enrollment and removal of live match viewers, rechecks each recipient's access, obtains that recipient's permitted view, and offers best-effort updates after match handling identifies a public-state change, including save/resume and full time. The acting player's request-correlated reply and pre-activation preparation notices remain outside this module. Match handling returns an explicit publication outcome instead of a consumable completion flag; the remaining offline `/browser/v1` caller uses that outcome until its separately tracked retirement. This keeps the access and delivery rules at one seam without changing the browser protocol, durable match state, single-worker mutation order, or delivery guarantees.

Verification of this decision uses current `/browser/v2` tests for player and spectator views, revoked recipients, ordinary updates, and terminal reconciliation after an uncertain commit with real database behavior. Historical `/browser/v1` process-kill evidence is not evidence for the current runtime. New publication counters and a new process-kill campaign are outside this workstream.
