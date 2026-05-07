#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isPermissionsBypassed } from "./lib/detect-mode.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.join(process.env.HOME || "", ".aside");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

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
  return result.stdout || "";
}

function main() {
  const input = readHookInput();
  const config = readConfig();

  if (config.subagentReview === false) return;

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (isPermissionsBypassed()) {
    const output = runReview(cwd);
    if (output.trim()) {
      process.stdout.write(
        `[aside subagent-review] Codex reviewed changes after subagent completed:\n${output}\n`
      );
    }
  } else {
    process.stdout.write(
      `[aside] Subagent finished. Run /aside:review --uncommitted to review its changes.\n`
    );
  }
}

try { main(); }
catch (error) {
  process.stderr.write(
    `aside subagent-stop-hook: ${error instanceof Error ? error.message : String(error)}\n`
  );
}
