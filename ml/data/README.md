# Local datasets

**`classification_frames/`** is allowed in Git (not greyed out / ignored) so tools and teammates can use it locally. Other paths under `ml/data/` stay ignored unless you add new `!` rules in the root `.gitignore`.

## Suggested hackathon workflow (avoid huge GitHub pushes)

1. Run feature extraction on frames → e.g. `features.csv` (still gitignored unless you whitelist it).
2. Train the second-stage classifier on those features → `ml/checkpoints/*.joblib` (these **are** allowed in Git; large `.pt` / other files under `ml/checkpoints/` stay ignored).
3. **Delete** the raw frame folders you no longer need (e.g. `classification_frames/`).
4. `git status` — confirm no multi‑MB images are staged — then push.

You do **not** need to keep raw images after training: the **joblib** (and optional **CSV**) hold what the runtime needs, as long as feature columns match at inference time.

Legacy layout example:

`ml/data/my_dataset/awake/*.jpg`  
`ml/data/my_dataset/drowsy/*.jpg`
