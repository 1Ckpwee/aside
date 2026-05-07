#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isPermissionsBypassed } from "./lib/detect-mode.mjs";
import { readTracker, resetTracker } from "./lib/tracker.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(process.env.HOME || "", ".aside");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const REVIEW_THRESHOLD = parseInt(process.env.ASIDE_REVIEW_THRESHOLD || "5", 10);
const COOLDOWN_SECONDS = parseInt(process.env.ASIDE_REVIEW_COOLDOWN || "120", 10);

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return {}; }
}

function readHookInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function runReview(cwd) {
  const asideScript = path.join(SCRIPT_DIR, "aside.sh");
  const result = spawnSync("bash", [asideScript, "review", "--uncommitted"], {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 15 * 60 * 1000,
  });
  if (result.status !== 0) return { ok: false, output: "" };
  return { ok: true, output: result.stdout || "" };
}

function main() {
  const input = readHookInput();
  const config = readConfig();

  if (config.autoReview === false) return;

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const tracker = readTracker(cwd);

  if ((tracker.editCount || 0) < REVIEW_THRESHOLD) return;

  const now = Date.now();
  const elapsed = (now - (tracker.lastReviewTime || 0)) / 1000;
  if (elapsed < COOLDOWN_SECONDS) return;

  if (isPermissionsBypassed()) {
    const { ok, output } = runReview(cwd);
    if (ok && output.trim()) {
      process.stdout.write(
        `[aside notification-review] Codex reviewed ${tracker.editCount} pending edits:\n${output}\n`
      );
    }
    if (ok) resetTracker(cwd);
  } else {
    const files = (tracker.changedFiles || []).map(f => path.basename(f)).join(", ");
    process.stdout.write(
      `[aside] ${tracker.editCount} pending edits (${files}). Run /aside:review --uncommitted to check.\n`
    );
    resetTracker(cwd);
  }
}

try { main(); }
catch (error) {
  process.stderr.write(
    `aside notification-hook: ${error instanceof Error ? error.message : String(error)}\n`
  );
}
