---
description: Check tmux, Codex CLI, and authentication status
argument-hint: '[--enable-review-gate|--disable-review-gate] [--enable-auto-review|--disable-auto-review] [--enable-subagent-review|--disable-subagent-review]'
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
5. If a toggle flag was passed, confirm the action:
   - `--enable-review-gate` / `--disable-review-gate`: stop-time review gate
   - `--enable-auto-review` / `--disable-auto-review`: auto-review after N file edits (PostToolUse hook)
   - `--enable-subagent-review` / `--disable-subagent-review`: auto-review when a subagent finishes
