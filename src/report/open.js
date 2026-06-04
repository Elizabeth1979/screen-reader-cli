import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

function defaultLaunch(filePath) {
  const cmd = process.platform === "darwin" ? "open" : "cmd";
  const args =
    process.platform === "darwin" ? [filePath] : ["/c", "start", filePath];
  execFileSync(cmd, args);
}

export function openReport(
  html,
  filename = "scan-report.html",
  launch = defaultLaunch,
) {
  const dir = path.join(os.tmpdir(), "screenreader-reports");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, html, "utf-8");

  // SR_NO_OPEN suppresses the browser launch (tests / CI / headless runs) —
  // the report is still written and the path returned.
  if (!process.env.SR_NO_OPEN) {
    launch(filePath);
  }

  return filePath;
}
