#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/lib/preflight.sh"

ASIDE_LAYOUT="${ASIDE_LAYOUT:-bottom}"
ASIDE_TIMEOUT="${ASIDE_TIMEOUT:-900}"
ASIDE_PANE_DELAY="${ASIDE_PANE_DELAY:-2}"
ASIDE_CONFIG_DIR="${HOME}/.aside"
ASIDE_CONFIG_FILE="${ASIDE_CONFIG_DIR}/config.json"

die() { echo "aside: $*" >&2; exit 1; }

read_config_key() {
  local key="$1"
  if [ -f "$ASIDE_CONFIG_FILE" ]; then
    # Minimal JSON key reader — no jq dependency
    sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\(.*\)/\1/p" "$ASIDE_CONFIG_FILE" | sed 's/[",]//g' | head -1
  fi
}

write_config_key() {
  local key="$1" value="$2"
  mkdir -p "$ASIDE_CONFIG_DIR"
  if [ -f "$ASIDE_CONFIG_FILE" ]; then
    # Update existing key or add new one
    if grep -q "\"${key}\"" "$ASIDE_CONFIG_FILE" 2>/dev/null; then
      sed -i '' "s/\"${key}\"[[:space:]]*:[[:space:]]*.*/\"${key}\": ${value},/" "$ASIDE_CONFIG_FILE"
    else
      sed -i '' "s/^{/{ \"${key}\": ${value},/" "$ASIDE_CONFIG_FILE"
    fi
  else
    echo "{ \"${key}\": ${value} }" > "$ASIDE_CONFIG_FILE"
  fi
}

make_job_dir() {
  mktemp -d "${TMPDIR:-/tmp}/aside-XXXXXX"
}

tmux_split_flags() {
  case "$ASIDE_LAYOUT" in
    right)  echo "-h -l 50%" ;;
    *)      echo "-v -l 40%" ;;
  esac
}

run_in_pane() {
  local job_dir="$1"
  local codex_cmd="$2"

  local wrapper_cmd
  wrapper_cmd="$codex_cmd; echo \$? > '${job_dir}/exit_code'; echo done > '${job_dir}/status'; sleep ${ASIDE_PANE_DELAY}"

  echo "running" > "${job_dir}/status"

  if ! check_tmux; then
    echo "aside: not inside tmux — running Codex inline." >&2
    eval "$codex_cmd" >&2
    local rc=$?
    echo "$rc" > "${job_dir}/exit_code"
    echo "done" > "${job_dir}/status"
    return $rc
  fi

  local split_flags
  split_flags=$(tmux_split_flags)

  local pane_id
  # shellcheck disable=SC2086
  pane_id=$(tmux split-window $split_flags -d -P -F '#{pane_id}' "$wrapper_cmd")
  echo "$pane_id" > "${job_dir}/pane_id"

  # Poll until done or timeout
  local elapsed=0
  while [ "$elapsed" -lt "$ASIDE_TIMEOUT" ]; do
    if [ -f "${job_dir}/status" ] && [ "$(cat "${job_dir}/status")" != "running" ]; then
      break
    fi
    # If pane died without writing status
    if ! tmux list-panes -F '#{pane_id}' 2>/dev/null | grep -q "$pane_id"; then
      echo "failed" > "${job_dir}/status"
      echo "1" > "${job_dir}/exit_code"
      break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  if [ "$elapsed" -ge "$ASIDE_TIMEOUT" ]; then
    tmux kill-pane -t "$pane_id" 2>/dev/null || true
    echo "failed" > "${job_dir}/status"
    echo "1" > "${job_dir}/exit_code"
    echo "aside: timeout after ${ASIDE_TIMEOUT}s" >&2
  fi
}

cmd_setup() {
  local enable_gate="" disable_gate=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --enable-review-gate)  enable_gate=1; shift ;;
      --disable-review-gate) disable_gate=1; shift ;;
      *) shift ;;
    esac
  done

  if [ -n "$enable_gate" ]; then
    write_config_key "stopReviewGate" "true"
    echo "Review gate enabled."
  elif [ -n "$disable_gate" ]; then
    write_config_key "stopReviewGate" "false"
    echo "Review gate disabled."
  fi

  print_setup_report
}

cmd_review() {
  local base="" uncommitted="" model="" extra_args=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --base)        base="$2"; shift 2 ;;
      --uncommitted) uncommitted=1; shift ;;
      --model|-m)    model="$2"; shift 2 ;;
      *)             extra_args+=("$1"); shift ;;
    esac
  done

  local err
  err=$(check_codex 2>&1) || die "$err"

  local job_dir
  job_dir=$(make_job_dir)
  local result_file="${job_dir}/result.txt"

  local cmd="codex exec review -o '${result_file}'"
  [ -n "$base" ] && cmd+=" --base '$base'"
  [ -n "$uncommitted" ] && cmd+=" --uncommitted"
  [ -n "$model" ] && cmd+=" -m '$model'"
  [ ${#extra_args[@]} -gt 0 ] && cmd+=" ${extra_args[*]}"

  run_in_pane "$job_dir" "$cmd"

  if [ -f "$result_file" ]; then
    cat "$result_file"
  else
    local exit_code
    exit_code=$(cat "${job_dir}/exit_code" 2>/dev/null || echo "1")
    echo "aside: Codex review finished with no output (exit code: $exit_code)" >&2
  fi

  rm -rf "$job_dir"
}

cmd_task() {
  local write="" model="" prompt="" extra_args=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --write)    write=1; shift ;;
      --model|-m) model="$2"; shift 2 ;;
      -*)         extra_args+=("$1"); shift ;;
      *)          prompt+="${prompt:+ }$1"; shift ;;
    esac
  done

  [ -z "$prompt" ] && die "provide a prompt for the task"

  local err
  err=$(check_codex 2>&1) || die "$err"

  local job_dir
  job_dir=$(make_job_dir)
  local result_file="${job_dir}/result.txt"

  # Write prompt to file to avoid shell escaping issues
  echo "$prompt" > "${job_dir}/prompt.txt"

  local sandbox="read-only"
  [ -n "$write" ] && sandbox="workspace-write"

  local cmd="codex exec -o '${result_file}' -s '${sandbox}'"
  [ -n "$model" ] && cmd+=" -m '$model'"
  [ ${#extra_args[@]} -gt 0 ] && cmd+=" ${extra_args[*]}"
  cmd+=" < '${job_dir}/prompt.txt'"

  run_in_pane "$job_dir" "$cmd"

  if [ -f "$result_file" ]; then
    cat "$result_file"
  else
    local exit_code
    exit_code=$(cat "${job_dir}/exit_code" 2>/dev/null || echo "1")
    echo "aside: Codex task finished with no output (exit code: $exit_code)" >&2
  fi

  rm -rf "$job_dir"
}

cmd_stop_review() {
  local cwd="${1:-.}"
  local claude_message="${2:-}"
  local prompt_template="${PLUGIN_ROOT}/prompts/stop-review-gate.md"

  local err
  err=$(check_codex 2>&1) || die "$err"

  local job_dir
  job_dir=$(make_job_dir)
  local result_file="${job_dir}/result.txt"

  # Build prompt from template
  local prompt
  if [ -f "$prompt_template" ] && [ -n "$claude_message" ]; then
    prompt=$(sed "s|{{CLAUDE_RESPONSE_BLOCK}}|${claude_message}|g" "$prompt_template")
  else
    prompt="Review the following Claude Code response for code quality issues. Reply with ALLOW: or BLOCK: on the first line.\n\n${claude_message}"
  fi

  echo "$prompt" > "${job_dir}/prompt.txt"

  local cmd="codex exec -o '${result_file}' -s read-only --ephemeral < '${job_dir}/prompt.txt'"

  run_in_pane "$job_dir" "$cmd"

  if [ -f "$result_file" ]; then
    cat "$result_file"
  fi

  rm -rf "$job_dir"
}

# --- Main ---

subcmd="${1:-help}"
shift || true

case "$subcmd" in
  setup)        cmd_setup "$@" ;;
  review)       cmd_review "$@" ;;
  task)         cmd_task "$@" ;;
  stop-review)  cmd_stop_review "$@" ;;
  help|--help)
    cat <<'USAGE'
aside — Run Codex in a visible tmux pane

Usage:
  aside.sh setup [--enable-review-gate|--disable-review-gate]
  aside.sh review [--base <ref>] [--uncommitted] [-m <model>]
  aside.sh task [--write] [-m <model>] <prompt>
  aside.sh stop-review [cwd] [claude_message]

Environment:
  ASIDE_LAYOUT   Pane position: bottom (default) or right
  ASIDE_TIMEOUT  Max wait in seconds (default: 900)
USAGE
    ;;
  *)
    die "unknown command: $subcmd (try: aside.sh help)"
    ;;
esac
