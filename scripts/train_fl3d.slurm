#!/bin/bash
#SBATCH --job-name=heimdall-fl3d
#SBATCH --output=logs/fl3d-%j.out
#SBATCH --error=logs/fl3d-%j.err
#SBATCH --time=04:00:00
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=32G
#SBATCH --gres=gpu:1
## SBATCH --partition=YOUR_PARTITION

# Purdue Gautschi: replace partition / account / modules with your site-specific values.
# Load modules if your cluster uses environment modules, e.g.:
# module load cuda/12.2
# module load python/3.11

set -euo pipefail
mkdir -p logs

ROOT="${SLURM_SUBMIT_DIR:-$PWD}"
cd "$ROOT"

if [[ ! -d venv ]]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r ml/requirements.txt

export PYTHONPATH=ml
python ml/training/train_fl3d.py --epochs 10 --out ml/checkpoints/fl3d_run_${SLURM_JOB_ID}.pt

echo "Done. Check ml/checkpoints/"
