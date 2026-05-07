import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CONFIG_DIR = path.join(process.env.HOME || "", ".aside");

export function trackerPath(cwd) {
  const hash = crypto.createHash("md5").update(cwd || "default").digest("hex").slice(0, 8);
  return path.join(CONFIG_DIR, `edit-tracker-${hash}.json`);
}

export function readTracker(cwd) {
  try { return JSON.parse(fs.readFileSync(trackerPath(cwd), "utf8")); }
  catch { return { editCount: 0, changedFiles: [], lastReviewTime: 0 }; }
}

export function writeTracker(cwd, data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(trackerPath(cwd), JSON.stringify(data, null, 2));
}

export function resetTracker(cwd) {
  writeTracker(cwd, { editCount: 0, changedFiles: [], lastReviewTime: Date.now() });
}
