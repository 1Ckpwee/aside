#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isPermissionsBypassed } from "./lib/detect-mode.mjs";
import { readTracker, writeTracker, resetTracker } from "./lib/tracker.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(process.env.HOME || "", ".aside");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const REVIEW_THRESHOLD = parseInt(process.env.ASIDE_REVIEW_THRESHOLD || "5", 10);
const COOLDOWN_SECONDS = parseInt(process.env.ASIDE_REVIEW_COOLDOWN || "120", 10);

const TRACKED_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

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
  if (result.status !== 0) {
    const err = (result.stderr || "").trim();
    return { ok: false, output: "", error: err || `exit code ${result.status}` };
  }
  return { ok: true, output: result.stdout || "", error: "" };
}

function main() {
  const input = readHookInput();
  const config = readConfig();

  if (config.autoReview === false) return;

  const toolName = input.tool_name || "";
  if (!TRACKED_TOOLS.has(toolName)) return;

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const tracker = readTracker(cwd);
  tracker.editCount = (tracker.editCount || 0) + 1;

  const filePath = input.tool_input?.file_path || "";
  if (filePath && !(tracker.changedFiles || []).includes(filePath)) {
    tracker.changedFiles = tracker.changedFiles || [];
    tracker.changedFiles.push(filePath);
  }

  const now = Date.now();
  const elapsed = (now - (tracker.lastReviewTime || 0)) / 1000;

  if (tracker.editCount >= REVIEW_THRESHOLD && elapsed >= COOLDOWN_SECONDS) {
    if (isPermissionsBypassed()) {
      const { ok, output, error } = runReview(cwd);
      if (!ok) {
        process.stderr.write(`[aside] auto-review failed: ${error}\n`);
        writeTracker(cwd, tracker);
        return;
      }
      if (output.trim()) {
        process.stdout.write(
          `[aside auto-review] Triggered after ${tracker.editCount} edits across ${(tracker.changedFiles || []).length} files:\n${output}\n`
        );
      }
      resetTracker(cwd);
    } else {
      const files = (tracker.changedFiles || []).map(f => path.basename(f)).join(", ");
      process.stdout.write(
        `[aside] ${tracker.editCount} file edits since last review (${files}). Run /aside:review --uncommitted to check changes.\n`
      );
      resetTracker(cwd);
    }
  } else {
    writeTracker(cwd, tracker);
  }
}

try { main(); }
catch (error) {
  process.stderr.write(
    `aside post-tool-hook: ${error instanceof Error ? error.message : String(error)}\n`
  );
}
