#!/usr/bin/env bash
# Local or login-node webcam demo (not usually run on cluster head — use interactive GPU node if needed).
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=ml
python ml/scripts/infer_webcam.py "${@:---camera 0}"
