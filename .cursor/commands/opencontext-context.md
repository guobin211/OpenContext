--- Cursor Command: opencontext-context.md ---
---
title: /opencontext-context
description: Load relevant OpenContext docs for the current task (safe, no index build)
---

Goal: Load enough context from OpenContext so you can proceed confidently.
Safety: Do NOT trigger index builds by default (no `oc index build`). Prefer manifest + direct reads.

1. If the target space/folder is unclear, run `oc folder ls --all` and ask the user to choose a folder (no guessing when ambiguous).
2. Run `oc context manifest <folder_path> --limit 10` (or `oc context manifest . --limit 10` for broad context).
3. Load 3–10 relevant files by `abs_path` and extract:
   - Key constraints, decisions, and current state
   - Open questions / risks
4. Cite sources:
   - Prefer stable links `oc://doc/<stable_id>` when available in the manifest output.
   - Use `abs_path` + `range` only for line-level evidence.
5. Summarize the loaded context and proceed with the user’s task.
--- End Command ---
