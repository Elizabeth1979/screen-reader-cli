import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

function defaultLaunch(filePath) {
  if (process.platform === "darwin") {
    execFileSync("open", [filePath]);
  } else if (process.platform === "win32") {
    // The empty string is start's window-title argument — without it a
    // quoted path would be consumed as the title instead of the file.
    execFileSync("cmd", ["/c", "start", "", filePath]);
  } else {
    execFileSync("xdg-open", [filePath]);
  }
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
