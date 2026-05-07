#!/usr/bin/env bash
# Preflight checks for aside: tmux, codex, auth detection.
# Sourced by aside.sh — do not execute directly.

check_tmux() {
  if [ -n "${TMUX:-}" ]; then
    return 0
  fi
  return 1
}

check_codex() {
  if ! command -v codex &>/dev/null; then
    echo "codex not found in PATH"
    return 1
  fi
  if ! codex exec --help &>/dev/null; then
    echo "codex exec subcommand not available"
    return 1
  fi
  return 0
}

check_codex_auth() {
  local output
  output=$(codex exec --ephemeral --skip-git-repo-check "echo ok" 2>&1)
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo "$output"
    return 1
  fi
  return 0
}

get_codex_version() {
  codex --version 2>/dev/null || echo "unknown"
}

print_setup_report() {
  local tmux_ok="false"
  local codex_ok="false"
  local auth_ok="false"
  local codex_version=""
  local codex_err=""
  local auth_err=""

  if check_tmux; then
    tmux_ok="true"
  fi

  if check_codex 2>/dev/null; then
    codex_ok="true"
    codex_version=$(get_codex_version)
  else
    codex_err="codex not available"
  fi

  if [ "$codex_ok" = "true" ]; then
    if check_codex_auth 2>/dev/null; then
      auth_ok="true"
    else
      auth_err="not authenticated"
    fi
  fi

  cat <<EOF
{
  "tmux": { "available": $tmux_ok },
  "codex": { "available": $codex_ok, "version": "$codex_version", "error": "$codex_err" },
  "auth": { "ok": $auth_ok, "error": "$auth_err" }
}
EOF
}
