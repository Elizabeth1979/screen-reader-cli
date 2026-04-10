#!/usr/bin/env node
import { program, Command } from "commander";
import { pageCommand } from "../src/commands/page.js";
import { navCommand } from "../src/commands/nav.js";
import { speakCommand } from "../src/commands/speak.js";
import { auditCommand } from "../src/commands/audit.js";
import { screenshotCommand } from "../src/commands/screenshot.js";
import { scanCommand } from "../src/commands/scan.js";
import { liveCommand } from "../src/commands/live.js";
import { startRepl } from "../src/repl.js";
import { startDaemon, stopDaemon, isDaemonRunning } from "../src/daemon.js";

program
  .name("screenreader")
  .description("Screen reader CLI — browse any page as a screen reader would")
  .version("0.1.0");

program.addCommand(pageCommand());
program.addCommand(navCommand());
program.addCommand(speakCommand());
program.addCommand(auditCommand());
program.addCommand(screenshotCommand());
program.addCommand(scanCommand());
program.addCommand(liveCommand());

const daemon = new Command("daemon").description("Manage the browser daemon");

daemon
  .command("start")
  .description("Start the browser daemon")
  .action(async () => {
    const info = await startDaemon();
    console.log(`Daemon started (pid: ${info.pid})`);
    console.log(`WebSocket: ${info.wsEndpoint}`);
  });

daemon
  .command("stop")
  .description("Stop the browser daemon")
  .action(async () => {
    await stopDaemon();
    console.log("Daemon stopped.");
  });

daemon
  .command("status")
  .description("Check daemon status")
  .action(() => {
    if (isDaemonRunning()) {
      console.log("Daemon is running.");
    } else {
      console.log("Daemon is not running.");
    }
  });

program.addCommand(daemon);

program
  .command("repl")
  .description("Start interactive REPL session")
  .action(startRepl);

// Default to REPL when no command given
if (process.argv.length <= 2) {
  startRepl();
} else {
  program.parse();
}
