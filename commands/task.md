---
description: Delegate a task to Codex in a visible tmux pane
argument-hint: '[--write] [-m <model>] <prompt>'
allowed-tools: Bash(bash:*), Read
---

Delegate a task to Codex, running it in a separate tmux pane so the user can watch.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraints:
- Run exactly one Codex task invocation.
- Return Codex's output verbatim.
- If `--write` was used, note that Codex may have modified files in the workspace.

Execution:
1. Run:
```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/aside.sh" task $ARGUMENTS
```
2. This script blocks until Codex finishes. Do not run it in the background.
3. Return the stdout verbatim.
4. If Codex made file changes (--write mode), mention that the user should review the changes.

If the user is not inside tmux, the script falls back to inline execution automatically.
