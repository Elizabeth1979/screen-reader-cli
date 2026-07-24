#!/usr/bin/env node
import fs from "node:fs";
import { program } from "commander";
import { pageCommand } from "../src/commands/page.js";
import { navCommand } from "../src/commands/nav.js";
import { speakCommand } from "../src/commands/speak.js";
import { auditCommand } from "../src/commands/audit.js";
import { screenshotCommand } from "../src/commands/screenshot.js";
import { scanCommand } from "../src/commands/scan.js";
import { liveCommand } from "../src/commands/live.js";
import { startRepl } from "../src/repl.js";

const { version } = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

// Fail cleanly instead of dumping a raw stack trace when an async command
// action rejects (bad URL, missing daemon, provider HTTP error, …).
process.on("unhandledRejection", (err) => {
  console.error(`Error: ${err?.message || err}`);
  process.exit(1);
});

program
  .name("screenreader")
  .description("Screen reader CLI — browse any page as a screen reader would")
  .version(version);

program.addCommand(pageCommand());
program.addCommand(navCommand());
program.addCommand(speakCommand());
program.addCommand(auditCommand());
program.addCommand(screenshotCommand());
program.addCommand(scanCommand());
program.addCommand(liveCommand());

program
  .command("repl")
  .description("Start interactive REPL session")
  .action(startRepl);

// Default to REPL when no command given
if (process.argv.length <= 2) {
  startRepl();
} else {
  program.parseAsync().catch((err) => {
    console.error(`Error: ${err?.message || err}`);
    process.exit(1);
  });
}
