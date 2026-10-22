# Journal native continuations without reexecuting accepted actions

Accepted for [#336](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/336)
on 2026-10-22; supersedes the single-blob storage choice in
[ADR 0002](0002-bounded-match-transcript.md), preserving its public transcript and
durable acceptance contract. Full recovery documents repeatedly serialize and
compress growing history, so use a base checkpoint plus bounded post-action
continuations and append-only history tails, committed under the existing
single-match generation CAS in one database transaction. Recovery assembles the
exact recorded state and validates it through the existing native restore path;
it does not rerun commands, dice, clocks or optional-skill decisions.

The durable head and base-checkpoint generations are separate so missing journal
records cannot silently roll a match back. Periodic transactional compaction
replaces the base and removes its covered records; legacy full checkpoints remain
readable. Acceptance still waits for durable commit, including at failure and
retry boundaries. This costs a more complex storage layout and bounded recovery
assembly, but avoids acknowledging volatile actions or changing native mechanics
to make input replay deterministic.

Native log commands can retain references to mutable engine values, including
target-selection state. The browser recovery boundary therefore freezes each
new command's JSON once; both full checkpoints and journal tails use those
snapshots. Live command objects and the default desktop serialization remain
unchanged. Resetting or replacing a native log invalidates its recovery cursor
and requires a full checkpoint. This adds one serialized recovery copy per
command, avoiding repeated full-history encoding without assuming engine objects
are immutable.
