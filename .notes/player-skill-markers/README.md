# Player skill marker design and artwork archive

This archive retains the manifest decisions, sample rounds, owner-directed art
revisions, source images, exported variants, pitch mockups, prototypes, test
evidence and delivery notes from the player skill marker feature.

The production implementation was merged through [PR #296](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/296).
Its maintained contract and manifest are [the specification](../../docs/specs/player-skill-markers.md)
and [the manifest](../../docs/specs/player-skill-markers-manifest.json).
Production artwork lives under `assets/game/ui/player-skill-markers-v1/`.
Files here are historical review material, outside production asset delivery,
TypeScript source discovery and automated browser-suite discovery.

## Review history

- [Original feature decisions](feature-spec.md), [manifest](manifest.md) and [thread summary](thread-summary.md).
- [Text sample round 1](text-round-1/README.md), [round 2](text-round-2/README.md) and [complete text pack](text-full/README.md).
- [Illustrated sample round 1](illustrated-round-1/README.md), [round 2](illustrated-round-2/README.md) and [complete illustrated pack](illustrated-full/README.md).
- [Verification](verification.md), [playback timeout investigation](playback-build-timeout.md) and [merge outcome](merge-outcome.md).

## Historical code and checkout records

`prototypes/browser-client/` preserves the six prototype pages/components/styles
and four art-review scripts using their original relative paths. To revisit a
prototype, restore those files into the corresponding paths in a disposable
browser-client worktree with the matching dependencies. They are archived here
so they do not participate in the maintained browser build or test inventory.

`checkout-preservation/` records the original dirty checkout before switching
the owner workspace to clean `main`. Its inventories contain original paths,
sizes and SHA-256 hashes; `working-tree.patch` preserves the tracked edits,
including separate unpublished playback changes. This is a historical patch
against the old feature base and includes work already merged in PR #296.
It is not a patch to apply wholesale to current `main`.

Logs and earlier handoff documents describe their state at capture time. Local
Windows paths, tool locations and stash IDs in them are provenance rather than
portable setup instructions. Preserve original archive bytes when checking the
recorded artwork hashes.

The owner explicitly authorized publishing this archive directly to `main` as
a one-time exception. The normal delivery workflow remains branch, implement,
self-review, validate, commit, open PR and merge. This archival publication does
not apply the separate playback changes or deploy the game.
