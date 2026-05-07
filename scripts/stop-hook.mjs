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

function readHookInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function emitDecision(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function parseStopReviewOutput(rawOutput) {
  const text = String(rawOutput ?? "").trim();
  if (!text) {
    return { ok: false, reason: "Codex stop-gate review returned no output." };
  }
  const firstLine = text.split(/\r?\n/, 1)[0].trim();
  if (firstLine.startsWith("ALLOW:")) {
    return { ok: true, reason: null };
  }
  if (firstLine.startsWith("BLOCK:")) {
    const reason = firstLine.slice("BLOCK:".length).trim() || text;
    return { ok: false, reason: `Codex review gate: ${reason}` };
  }
  return { ok: false, reason: "Codex stop-gate returned unexpected output." };
}

function main() {
  const input = readHookInput();
  const config = readConfig();

  if (config.stopReviewGate === false) {
    return;
  }

  if (!isPermissionsBypassed()) {
    process.stdout.write(
      `[aside] Claude is about to stop. Run /aside:review --uncommitted to review changes before finishing.\n`
    );
    return;
  }

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const lastMessage = String(input.last_assistant_message ?? "").trim();

  const asideScript = path.join(SCRIPT_DIR, "aside.sh");
  const result = spawnSync("bash", [asideScript, "stop-review", cwd, lastMessage], {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: 15 * 60 * 1000
  });

  if (result.error?.code === "ETIMEDOUT") {
    emitDecision({ decision: "block", reason: "Codex stop-gate review timed out." });
    return;
  }

  if (result.status !== 0) {
    const detail = String(result.stderr || "").trim();
    emitDecision({ decision: "block", reason: detail || "Codex stop-gate review failed." });
    return;
  }

  const review = parseStopReviewOutput(result.stdout);
  if (!review.ok) {
    emitDecision({ decision: "block", reason: review.reason });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
