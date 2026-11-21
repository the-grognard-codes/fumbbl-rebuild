#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
MAVEN=${MAVEN:-"$ROOT/.tools/apache-maven-3.9.9/bin/mvn"}
REPOSITORY=${REPOSITORY:-"$ROOT/.tools/repository"}
cd "$ROOT"
mkdir -p .tools
"$MAVEN" --batch-mode --no-transfer-progress --settings .mvn/settings.xml "-Dmaven.repo.local=$REPOSITORY" -pl ffb-server -am -DskipTests install
"$MAVEN" --batch-mode --no-transfer-progress --settings .mvn/settings.xml "-Dmaven.repo.local=$REPOSITORY" -pl ffb-server dependency:build-classpath -Dmdep.includeScope=test "-Dmdep.outputFile=$ROOT/.tools/training-dependencies.txt"
printf '%s:%s:%s:%s\n' "$ROOT/ffb-server/target/test-classes" "$ROOT/ffb-server/target/classes" "$ROOT/ffb-common/target/classes" "$(cat .tools/training-dependencies.txt)" > .tools/training-classpath.txt
