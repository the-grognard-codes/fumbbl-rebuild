# Saved formation data and starter defaults

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/465

Approved requirements and workstream acceptance criteria:
[deployment-formations.md](deployment-formations.md).

Data contract prerequisite for #466 and #467.

Implementation and verification evidence is recorded in
[deployment-formations-outcome.md](deployment-formations-outcome.md).

Implementation, self-review, and automated validation complete. Dev-local is
running with healthy services and verified ADC. Ready for the requested manual
acceptance check; issue remains open with the `ready-for-human` label.

Manual acceptance revision: added 7-2-2 Offense and Anchor Defense, corrected
Chevron's empty second row, and installed the approved revision on all 29
dev-local stored teams with backup, transactional guards, rollback proof, and
post-restart verification. New teams receive all four starters. The clean Java
build and all 77 browser suites passed again; rebuilt dev-local is ready.
