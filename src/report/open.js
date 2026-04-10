import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

export function openReport(html, filename = "scan-report.html") {
  const dir = path.join(os.tmpdir(), "screenreader-reports");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, html, "utf-8");

  const cmd = process.platform === "darwin" ? "open" : "cmd";
  const args = process.platform === "darwin" ? [filePath] : ["/c", "start", filePath];
  execFileSync(cmd, args);

  return filePath;
}
