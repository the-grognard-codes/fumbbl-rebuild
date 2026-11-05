The inventory is complete with the user's approved correction: `scatterPlayer` with `isScatter=false` contains D8 player scatter/bounce directions, not a D8+D6 deviation pair. Kickoff is the actual Deviation source.

The user explicitly approved displaying kickoff Deviation as D8 plus the actual D6/D3 distance. The before-roll Kick choice records D3; the after-roll Kick variant records its actual D6 before distance adjustment. Optional `scatterDistanceSides` metadata preserves that distinction through serialization, recovery, and coach transforms. Old untyped reports retain direction-only display. Other absent adapters remain deferred.

The correction and approval are recorded in `.notes/dice-readability/inventory-review.md`; implementation and validation are complete under #451.
