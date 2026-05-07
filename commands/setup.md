---
description: Check tmux, Codex CLI, and authentication status
argument-hint: '[--enable-review-gate|--disable-review-gate]'
allowed-tools: Bash(bash:*), Bash(npm:*), AskUserQuestion
---

Check whether aside's prerequisites are met: tmux, Codex CLI, and Codex authentication.

Raw slash-command arguments:
`$ARGUMENTS`

Execution:
1. Run:
```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/aside.sh" setup $ARGUMENTS
```
2. Parse the JSON output and present a human-readable report:
   - tmux: available or not (and whether currently inside a tmux session)
   - codex: installed version or missing
   - auth: authenticated or needs `codex login`
3. If Codex is not installed and npm is available, offer to install it:
   ```bash
   npm install -g @openai/codex
   ```
4. If Codex is installed but not authenticated, tell the user to run `!codex login`.
5. If `--enable-review-gate` or `--disable-review-gate` was passed, confirm the action.
