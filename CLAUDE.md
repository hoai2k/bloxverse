# Project policies for Claude

- **Always merge to `main` when a task is finished.** After the work on a task branch is complete, verified and pushed,
  merge the branch into `main` (fast-forward or merge commit) and push `main`. Do not leave finished work only on a feature branch.
- Keep `DEVNOTES.md` up to date with architecture and status so a fresh session can resume from the repository alone.
- The game is a no-build static site: serve the repo root (`python3 -m http.server 8080`) and open `index.html`.
  `index.html?quick&mode=creative&seed=1&rd=3` starts a throwaway world for quick testing.
- The previous project (Bloxverse) is preserved under `old/` for comparison; do not modify it.
