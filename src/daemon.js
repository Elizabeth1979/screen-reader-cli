import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const STATE_FILE = path.join(os.tmpdir(), "screenreader-daemon.json");

let browserServer = null;

export async function startDaemon() {
  if (browserServer) {
    return readState();
  }

  browserServer = await chromium.launchServer({ headless: true });
  const wsEndpoint = browserServer.wsEndpoint();

  const state = { wsEndpoint, pid: process.pid, startedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  return state;
}

export async function stopDaemon() {
  if (browserServer) {
    await browserServer.close();
    browserServer = null;
  }
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

export async function connectBrowser() {
  const state = readState();
  if (!state) {
    throw new Error("No running daemon. Run `screenreader daemon start` first.");
  }
  return chromium.connect(state.wsEndpoint);
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
}

export function isDaemonRunning() {
  return readState() !== null;
}
