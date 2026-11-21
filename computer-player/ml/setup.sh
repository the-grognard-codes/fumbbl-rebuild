#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
PYTHON=${PYTHON:-python3}
[ -x "$ROOT/.tools/ml-venv/bin/python" ] || "$PYTHON" -m venv "$ROOT/.tools/ml-venv"
"$ROOT/.tools/ml-venv/bin/python" -m pip install --disable-pip-version-check -r "$ROOT/computer-player/ml/requirements.txt"
cd "$ROOT/computer-player"
"$ROOT/.tools/ml-venv/bin/python" -m ml.check --device "${DEVICE:-cuda}"
