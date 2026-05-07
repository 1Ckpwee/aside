# aside

Run [OpenAI Codex](https://developers.openai.com/codex/cli/) in a visible tmux pane from [Claude Code](https://claude.ai/code).

Watch Codex work in real-time in a side pane. Results flow back to Claude Code automatically.

> **aside** (noun): a remark spoken in a play that other characters on stage are not supposed to hear.

## What it does

Instead of running Codex as an invisible background process, aside opens a tmux pane so you can watch Codex think, run commands, and produce results — then pipes those results back to Claude Code to continue working.

```
┌──────────────────────────────────┐
│  Claude Code                     │
│  > /aside:review                 │
│  Running Codex review...         │
├──────────────────────────────────┤
│  Codex (visible, real-time)      │
│  Reviewing 12 files...           │
│  ✓ src/auth.ts — no issues       │
│  ⚠ src/db.ts — SQL injection     │
└──────────────────────────────────┘
        ↓ Codex finishes, pane closes
        ↓ Results appear in Claude Code
```

## Requirements

- **tmux** — aside needs a tmux session to open side panes. Without tmux it falls back to inline execution.
- **Codex CLI** — `npm install -g @openai/codex`
- **Codex authentication** — run `codex login` once
- **Node.js 18+** — for the stop-gate hook

## Install

```bash
/plugin install aside@/path/to/aside
```

Then reload:

```bash
/reload-plugins
```

Verify:

```bash
/aside:setup
```

## Usage

### `/aside:review`

Run a Codex code review. Opens a tmux pane, runs the review, returns results.

```bash
/aside:review                    # review uncommitted changes
/aside:review --base main        # review branch vs main
/aside:review --uncommitted      # explicitly review working tree
/aside:review -m o3              # use a specific model
```

### `/aside:task`

Delegate a task to Codex. Opens a tmux pane, runs the task, returns output.

```bash
/aside:task investigate why tests are failing
/aside:task --write fix the login validation bug
/aside:task -m gpt-4.1 explain the auth middleware
```

Use `--write` to let Codex modify files. Without it, Codex runs in read-only mode.

### `/aside:setup`

Check prerequisites and configure the review gate.

```bash
/aside:setup                       # check tmux, codex, auth status
/aside:setup --enable-review-gate  # auto-review before Claude stops
/aside:setup --disable-review-gate # turn off auto-review
```

## Configuration

### Pane layout

Control where the Codex pane opens:

```bash
export ASIDE_LAYOUT=bottom   # default — 40% height bottom pane
export ASIDE_LAYOUT=right    # 50% width right pane
```

### Timeout

```bash
export ASIDE_TIMEOUT=900     # default — 15 minutes max
```

### Automation hooks

aside automatically triggers Codex reviews at different points during a Claude Code session. All hooks are **enabled by default** — no setup needed. Use `/aside:setup --disable-*` to turn off individual hooks.

#### Two modes based on permission state

aside detects how Claude Code was launched and adjusts behavior accordingly:

| Mode | When | Behavior |
|---|---|---|
| **Auto** | `--dangerously-skip-permissions` | Codex runs automatically. Stop hook can block Claude. No human action needed. |
| **Approve** | Normal (interactive) | Hooks output suggestions. Claude must call `/aside:review` explicitly, which goes through the normal permission prompt. |

Override with `ASIDE_MODE=auto` or `ASIDE_MODE=approve` environment variable.

#### Review gate (Stop hook)

Runs a Codex review before Claude stops. If Codex returns `BLOCK:`, Claude must fix the issues first.

```bash
/aside:setup --enable-review-gate
/aside:setup --disable-review-gate
```

#### Auto-review (PostToolUse hook)

Automatically triggers a Codex review after every N file edits (default: 5). Tracks Edit, Write, and NotebookEdit tool calls. Includes a cooldown (default: 120s) to avoid excessive reviews.

```bash
/aside:setup --enable-auto-review
/aside:setup --disable-auto-review
```

Configure thresholds via environment variables:

```bash
export ASIDE_REVIEW_THRESHOLD=5    # trigger after this many edits
export ASIDE_REVIEW_COOLDOWN=120   # minimum seconds between reviews
```

#### Subagent review (SubagentStop hook)

Automatically runs a Codex review whenever a Claude Code subagent finishes its work.

```bash
/aside:setup --enable-subagent-review
/aside:setup --disable-subagent-review
```

> **Warning:** Automation hooks create Claude → Codex feedback loops that may consume usage limits quickly. Only enable when actively monitoring.

## How it works

1. Claude Code runs `aside.sh` via a slash command
2. `aside.sh` creates a temp directory for the job
3. Opens a tmux pane running `codex exec review -o result.txt` (or `codex exec -o result.txt`)
4. Polls the status file until Codex finishes
5. Reads the result file and prints it to stdout
6. Claude Code receives the output and continues

No app-server protocol, no broker, no JSON-RPC. Just tmux + files.

## Without tmux

If you're not in a tmux session, aside runs Codex inline (same terminal). You lose the side-pane experience but everything still works. A warning is printed.

## vs codex-plugin-cc

| | codex-plugin-cc | aside |
|---|---|---|
| Codex visibility | Invisible background process | Visible tmux pane |
| Communication | JSON-RPC app-server protocol | File-based (temp dir) |
| Dependencies | Node.js, broker process | bash, tmux |
| Complexity | ~2000 lines, 15+ files | ~300 lines, 12 files |
| User can watch | No | Yes |
| User can interrupt | `/codex:cancel` | Ctrl+C in pane |

## License

MIT
