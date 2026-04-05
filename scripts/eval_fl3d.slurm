#!/bin/bash
#SBATCH --job-name=heimdall-eval
#SBATCH --output=logs/eval-%j.out
#SBATCH --error=logs/eval-%j.err
#SBATCH --time=01:00:00
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=2
#SBATCH --mem=16G
## SBATCH --gres=gpu:1

set -euo pipefail
mkdir -p logs
ROOT="${SLURM_SUBMIT_DIR:-$PWD}"
cd "$ROOT"
source venv/bin/activate
export PYTHONPATH=ml
python ml/training/eval_fl3d.py --checkpoint ml/checkpoints/fl3d_stub.json
