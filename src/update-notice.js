/**
 * Tell a human, once a day, that a newer version exists.
 *
 * Why this is hand-rolled rather than `update-notifier`: that package pulls in
 * 46 transitive dependencies for behaviour this file covers in ~40 lines, and
 * this CLI's whole install story is meant to stay light. What it does buy is
 * careful edge-case handling, so those cases are covered here deliberately and
 * tested individually — they are the actual risk, not the message.
 *
 * The rules, in order of how much damage breaking them does:
 *
 * 1. Never write to stdout. `--json` output is parsed by other programs, and a
 *    friendly line in the middle of it is a broken contract. Everything here
 *    goes to stderr.
 * 2. Never speak unless a human is watching. If stderr is not a TTY the output
 *    is being piped or captured — by CI, by a script, by an agent — and a
 *    notice there is noise nobody reads and something might parse.
 * 3. Never delay the command. The check is cached for a day and given a short
 *    timeout; if the network is slow or gone, the notice is skipped silently.
 * 4. Never fail the command. Every path here is wrapped; a broken notice must
 *    not turn a working scan into an error.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REGISTRY = "https://registry.npmjs.org/screen-reader-cli/latest";
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;
const CACHE = path.join(os.tmpdir(), "screen-reader-cli-update-check.json");

// Numeric compare, because "0.10.0" sorts before "0.9.0" as text — the classic
// version bug. A prerelease suffix is dropped rather than parsed: this only has
// to answer "should I mention an update", and being wrong about a beta is
// cheaper than a dependency that gets it exactly right.
export function isNewer(current, latest) {
  const parse = (v) =>
    typeof v === "string" &&
    /^\d+\.\d+\.\d+/.test(v) &&
    v.split("-")[0].split(".").map(Number);
  const a = parse(current);
  const b = parse(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}

// Exported and pure so each reason-to-stay-quiet can be tested on its own.
export function shouldCheck({ isTTY, env = {}, lastCheck = 0, now = Date.now() }) {
  if (!isTTY) return false;
  if (env.NO_UPDATE_NOTIFIER) return false;
  if (env.CI || env.GITHUB_ACTIONS || env.CONTINUOUS_INTEGRATION) return false;
  return now - lastCheck > CHECK_EVERY_MS;
}

// Message first, decoration last. A terminal has no way to skip ahead, so a
// screen reader reads this straight through — which makes the order the only
// lever there is. Anyone listening has the version and the command before the
// waveform starts, so the decoration is trailing and ignorable rather than a
// wall of punctuation in front of the point.
export function renderNotice(current, latest) {
  const d = (s) => `\x1b[2m${s}\x1b[0m`;
  const b = (s) => `\x1b[1m${s}\x1b[0m`;
  const cy = (s) => `\x1b[36m${s}\x1b[0m`;
  const gr = (s) => `\x1b[32m${s}\x1b[0m`;
  const yl = (s) => `\x1b[33m${s}\x1b[0m`;
  const gy = (s) => `\x1b[90m${s}\x1b[0m`;
  return [
    `${yl("▲")} ${b("Update available")} ${d(current)} → ${gr(latest)}`,
    `  ${gy("Run")} ${cy("npm install -g screen-reader-cli")}`,
    `  ${gr("▁▃▅▇▅▃▁▃▅▇▅▃▁")}  ${gy(`v${latest} is out`)}`,
  ].join("\n");
}

function readLastCheck() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf-8")).lastCheck ?? 0;
  } catch {
    return 0;
  }
}

function writeLastCheck(now) {
  try {
    fs.writeFileSync(CACHE, JSON.stringify({ lastCheck: now }), "utf-8");
  } catch {
    // A read-only or full temp dir must not break the CLI; the cost is
    // re-checking next run, which is harmless.
  }
}

/**
 * Run the check and print if warranted. Awaited at the end of a command, never
 * before the work, so a slow registry cannot delay the thing the user asked for.
 */
export async function notifyIfOutdated(currentVersion, opts = {}) {
  try {
    const isTTY = opts.isTTY ?? process.stderr.isTTY ?? false;
    const now = Date.now();
    if (!shouldCheck({ isTTY, env: opts.env ?? process.env, lastCheck: readLastCheck(), now })) {
      return;
    }
    writeLastCheck(now); // before fetching, so a hanging registry isn't retried every run
    const res = await fetch(REGISTRY, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return;
    const { version } = await res.json();
    if (isNewer(currentVersion, version)) {
      process.stderr.write("\n" + renderNotice(currentVersion, version) + "\n\n");
    }
  } catch {
    // Offline, slow, rate-limited, malformed — all mean "say nothing".
  }
}
