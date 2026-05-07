import { execSync } from "node:child_process";

export function isPermissionsBypassed() {
  if (process.env.ASIDE_MODE === "auto") return true;
  if (process.env.ASIDE_MODE === "approve") return false;
  try {
    let pid = process.ppid;
    while (pid > 1) {
      const args = execSync(`ps -o args= -p ${pid} 2>/dev/null`, { encoding: "utf8" }).trim();
      if (/--dangerously-skip-permissions/.test(args)) return true;
      const ppid = parseInt(
        execSync(`ps -o ppid= -p ${pid} 2>/dev/null`, { encoding: "utf8" }).trim(),
        10
      );
      if (!ppid || ppid === pid) break;
      pid = ppid;
    }
  } catch {}
  return false;
}
