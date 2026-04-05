# Training on Purdue Gautschi (Slurm)

This is a conservative template — **edit partition, account, modules, and paths** for your actual Gautschi environment.

## 1. Copy project and data

```bash
# From your laptop (example)
scp -r Heimdall/ YOUR_NETID@gautschi.rcac.purdue.edu:~/heimdall/
```

Place the FL3D dataset under `~/heimdall/ml/data/fl3d_raw/` after downloading from Kaggle (see `docs/dataset_fl3d.md`).

## 2. SSH and environment

```bash
ssh YOUR_NETID@gautschi.rcac.purdue.edu
cd ~/heimdall
module avail          # discover cuda/python modules on your cluster
# module load cuda/12.x
# module load python/3.11
python3 -m venv venv
source venv/bin/activate
pip install -r ml/requirements.txt
```

## 3. Submit training

```bash
mkdir -p logs
sbatch scripts/train_fl3d.slurm
squeue -u $USER
tail -f logs/fl3d-<JOBID>.out
```

## 4. Retrieve checkpoints

Checkpoints are written under `ml/checkpoints/` in the job working directory. Copy back:

```bash
scp YOUR_NETID@gautschi.rcac.purdue.edu:~/heimdall/ml/checkpoints/*.pt ./
```

## 5. CPU-only fallback

Comment out `#SBATCH --gres=gpu:1` in `scripts/train_fl3d.slurm` and reduce `--mem` / dataset size for debugging.

## 6. Interactive shell (debug)

```bash
salloc --nodes=1 --cpus-per-task=4 --mem=16G --time=01:00:00 bash
# or your site's interactive GPU flag
```

Then run `python ml/training/train_fl3d.py` directly.
