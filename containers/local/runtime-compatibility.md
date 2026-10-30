# Java 21 runtime compatibility boundary

Current source, shared libraries, tools and server builds require JDK 21 or newer
and compile for release 21. The tested toolchain is Temurin HotSpot
`21.0.11+10-LTS`, Apache Maven `3.9.9` and Jetty `12.1.13`.
Compatible third-party libraries may contain older bytecode. Newer JDKs are
outside the tested support matrix.

## Current build

```powershell
./tools/bootstrap.ps1
./tools/target-build.ps1 info
./tools/target-build.ps1 test
./tools/target-build.ps1 verify
```

Supply `-JavaHome` to bootstrap on Linux or when using an existing JDK. The build
launcher reuses the saved selection and restores Java/Maven environment variables
and the caller's directory. `build.ps1` delegates to the same Java 21 launcher.
The standalone game service also requires JDK 21 or newer. See the
[toolchain guide](../../tools/README.md) and current
[local runtime guide](README.md).

## Recovery and retirement

Removing an old build/runtime requirement does not convert a resident engine or
rewrite existing game data. Before stopping any legacy process, account for its
unfinished work and demonstrate completion or restore using a compatible durable
checkpoint on the Java 21 runtime. A process with only in-memory state must drain;
its state cannot be recovered by merely changing the JDK.

Current recovery preserves recorded runtime, engine, replay and catalog/version
bindings. Compatible r2.2/r2.3 format-2 checkpoints restore under their recorded
runtime; current R4.1 uses format 3. Activated pre-R2 matches without a checkpoint
remain unavailable. Unsupported or corrupt artifacts fail closed and remain stored;
there is no automatic conversion or replacement match. See
[recovery](recovery.md) and [session retention](session-retention.md).

Validate Java 21 startup and WebSocket framing, origin, queue/resync, timeout,
retry and clean close. Verify native snapshot/decision/dice parity, completed
replays and recoverable saved games with isolated fixtures and database copies.
Preserve stored matches, backups and rejection evidence. Do not test by replacing
a live process, sharing its mutable database, or deleting volumes. Runtime
shutdown, cutover and deployment require separate operational authorization.

## Historical R1 comparison

The M3d/M3e reference was `ffb-server:3.4.0-m3d.1` on Java 8 at frozen revision
`56c19c80070861e89f465f1989be403d3aad0ffd`. It is not a supported runtime for current
sources. Historical instructions, evidence and source at that revision remain
available for interpreting old artifacts; current setup does not provision it.
The original identifiers were engine `ffb-3.4.0-bb2025-m3d.1`, catalog
`bb2025-human-2026-09-08.1`, schema 4, browser V1 and the existing replay format.
That reference had no durable recovery artifact for a resident active engine.

`compose.r1.yaml` is an isolated diagnostic profile using the current Java 21
Dockerfile, its own database/backup volumes and loopback port 22228. It does not
recreate a frozen runtime or migrate retained games. The older comparison ports
and logs are historical evidence, not a requirement to keep an older JVM installed.
