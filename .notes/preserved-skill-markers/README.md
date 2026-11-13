# Preserved player skill marker work

Collected on 2026-11-13 from stash 48cf8b8500921b6ce5a09b6200e9324bf9b195fb and the uncommitted main checkout.

The preservation branch starts at origin/main 9820e43413bd501de8c0a4c0976808042ecd88e2. The skill-marker feature and ordered playback were delivered through PRs #296 and #299. This folder holds the additional historical material and source variants from the preserved checkout.

- history/ holds original artwork, design records, exports and review material.
- text-variants/ holds older text-marker SVGs.
- prototypes/ holds original prototype sources and their review scripts.
- snapshots/ holds older application and test file versions with their original paths beneath that folder.

manifest.json maps every stash entry to its Git blob and origin status. Every recovered entry records its preserved file, SHA-256 and byte count. Identical payloads share one file. Entries already available in this branch's origin ancestry retain their Git references in the manifest.

The manifest also records all seven files transferred from main. The soak driver is browser-client/test/overnight-soak.mjs, its inspection helper is browser-client/test/soak-peek.mjs, and its existing review is docs/specs/gameplay-soak-review.md.

Historical files retain their original bytes. The local .gitattributes disables newline conversion for these payloads.
