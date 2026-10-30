# Java 21 build toolchain

All project Java modules compile for Java 21 and require JDK 21 or newer.
Setup and CI pin Temurin 21.0.11+10 and Apache Maven 3.9.9 in
[target-build-toolchain.json](target-build-toolchain.json). Newer JDKs may be
selected explicitly but are outside the validated support matrix.

## Setup

On Windows, install the pinned JDK using [Windows setup](../docs/windows-development-setup.md),
then run from the repository root:

```powershell
./tools/bootstrap.ps1
./tools/target-build.ps1 info
./tools/test-tooling.ps1
```

To select an existing JDK, including on Linux:

```powershell
./tools/bootstrap.ps1 -JavaHome '/absolute/path/to/jdk-21'
./tools/target-build.ps1 info
```

[Ubuntu setup](../docs/ubuntu-development-setup.md) installs the pinned Linux JDK.
Bootstrap installs Maven under ignored `.tools/`, validates the existing JDK and
saves its absolute path in `.tools/java-home.txt`. Rerun it after moving a checkout
or changing JDK installations. It does not install a second Java runtime.
An explicit `-JavaHome` overrides the saved selection for one build.

PowerShell 5.1 and 7 are supported. If Windows execution policy blocks scripts,
use a process-only invocation such as:
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/bootstrap.ps1`.
Machine execution policy stays unchanged.

## Build and tests

```powershell
./tools/target-build.ps1 info
./tools/target-build.ps1 test -Module ffb-statetest -Test BlockTest
./tools/target-build.ps1 test -Module ffb-statetest -Test 'BlockTest#bothDownResolvesBothPlayersToProne'
./tools/target-build.ps1 install
./tools/target-build.ps1 verify
```

`install` performs `clean install`; `verify` performs `clean verify` across the
four-module reactor. Focused selectors include prerequisite modules with `-am`;
check the nonzero test count because a mistyped selector may match nothing.
`build.ps1` remains a compatibility alias for this same launcher, including its
`focused` characterization subset. There is one current Java baseline and no
Mockito compatibility profile. The standalone service is verified separately:

```powershell
mvn -B -f game-service/pom.xml clean verify
```

Run that command with JDK 21 and Maven 3.9.9; both POM roots enforce the minimum
Java version. Browser validation remains separate; see the root README.

## Reproducibility and offline use

Maven's ZIP is verified against the manifest SHA512 before extraction. Bootstrap
reuses `.tools/downloads` or the historical Maven audit archive before downloading
from Maven Central. Offline setup requires the pinned Maven archive and an
installed JDK: `./tools/bootstrap.ps1 -JavaHome /path/to/jdk -Offline`.
After dependencies have been downloaded, add `-Offline` to the build launcher.

The launcher uses the project Maven installation, `.tools/repository`, checked-in
empty user/global settings, UTF-8 Maven options and no ambient Maven startup
customizations. It restores the caller's environment and location and returns
Maven's exit status. Test reports are in module `target/surefire-reports` directories;
save evidence before another clean run. Packaging retains legacy timestamps and
Built-By metadata, so fixed tools do not imply byte-identical archives.

Tooling checks exercise offline setup, corrupt archives, paths containing spaces,
Java version rejection, caller environment restoration and Maven failure propagation.
CI uses the same bootstrap with the pinned Java 21 JDK. Only the dependency cache
is reused; a clean build recompiles project classes for release 21.

## Historical references and runtime retirement

The frozen Java 8 characterization belongs to revision
`56c19c80070861e89f465f1989be403d3aad0ffd`. Its scripts exist at that revision;
current scripts build current Java 21 sources. Preserve the
[archived evidence](../.notes/overhaul-analysis/verification/r1/java8-baseline/README.md)
for historical interpretation. Current setup no longer provisions or requires
that runtime. Existing ignored tool archives are machine-local artifacts and
are not automatically deleted.

See [runtime compatibility](../containers/local/runtime-compatibility.md) before
retiring old processes or handling stored matches. Build success alone does not
establish recovery or deployment acceptance.
