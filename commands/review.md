---
description: Run a Codex code review in a visible tmux pane
argument-hint: '[--base <ref>] [--uncommitted] [-m <model>]'
allowed-tools: Bash(bash:*), Read
---

Run a Codex code review in a separate tmux pane. The user can watch Codex work in real-time.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraints:
- This command is review-only.
- Do not fix issues or suggest changes.
- Return Codex's output verbatim.

Execution:
1. Run:
```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/aside.sh" review $ARGUMENTS
```
2. This script blocks until Codex finishes in the tmux pane. Do not run it in the background.
3. Return the stdout verbatim without paraphrasing or summarizing.
4. If the output mentions issues, do not attempt to fix them unless the user asks.

If the user is not inside tmux, the script falls back to inline execution automatically.
