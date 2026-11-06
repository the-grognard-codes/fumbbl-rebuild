# Roundup #6 environment retrospective

- Keep worktree dependency installs separate when dev-local startup runs `npm ci`. Sharing `node_modules` by junction allowed the clean install to partially remove the primary checkout's dependency cache and collide with a loaded native bundler. This run replaced the junction with an isolated install and restored the primary cache from the same lockfile before continuing.
- Use the installed owner-gh wrapper for scoped GitHub work. Its authentication probe is `--auth-status` alone, not combined with a repository request. Filter issue metadata before emitting output.
- Windows sandbox JAR access may fail during Java ZipFileSystem closure even when the file is readable. A narrow host-side pinned build verified the boundary and completed native validation.
- Browser fake-clock setup should pause relative to its current time; an absolute one-second deadline can already be past under parallel suite load.
- Asset-readiness assertions should follow the current SVG locator through late projection rerenders, rather than retaining an element handle that may be detached. The existing stress case passed three consecutive focused runs after this correction, followed by full validation.
- Cross-runtime tests add build-time dependencies to every path that runs Maven, including container builders. The container run caught the missing Node executable and excluded policy sources; the builder and strict context allowlist now include them, with no Node addition to the final Java runtime image.
- Existing full dev-local browser validation catches interactions beyond focused tests. Keep new production UI suites in the browser manifest. Server integration tests run automatically in the normal server suite; the native shard manifest specifically inventories state-test module classes. Cross-runtime server tests need Node available in the native CI job.

- A future startup improvement could resume from recorded successful browser validation after a container-only fix, provided it verifies the relevant source/artifact identity. The current lifecycle repeats every browser suite before attempting the container build, so packaging failures make otherwise successful UI validation expensive to repeat.

These are process findings and suggestions. No global agent instructions or credentials were changed.
