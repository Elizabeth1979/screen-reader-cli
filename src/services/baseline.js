// Baseline: accept today's violations so CI fails only on new ones.
//
// A finding is identified by rule id plus where it is (selector) and what it
// is (axe's HTML snippet). Either alone breaks too easily: adding one button
// turns another's "body > button" into "button:nth-child(4)", and editing a
// label changes the snippet. So matching runs in passes — exact, then same
// markup elsewhere (moved), then same place with new markup (edited) — and a
// finding is new only when both changed. Matching counts: three known
// "image-alt on img" plus a fourth is one new finding, not zero.

import fs from "node:fs";

const VERSION = 1;

// One accepted finding, in the shape the file stores.
const entry = (v) => ({
  id: v.id,
  selector: v.element?.selector || "",
  html: v.element?.html || "",
  message: v.message,
});

const PASSES = [
  (f) => `${f.id}|${f.selector}|${f.html}`,
  (f) => `${f.id}|${f.html}`,
  (f) => `${f.id}|${f.selector}`,
];

// The file a team commits. Sorted so re-running on an unchanged page gives a
// byte-identical file and a diff shows exactly which findings came or went.
export function createBaseline(results) {
  const findings = results.violations
    .map(entry)
    .sort(
      (a, b) =>
        a.id.localeCompare(b.id) ||
        a.selector.localeCompare(b.selector) ||
        a.html.localeCompare(b.html),
    );
  return { version: VERSION, url: results.url, findings };
}

export function writeBaseline(file, results) {
  const baseline = createBaseline(results);
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + "\n", "utf-8");
  return baseline;
}

// Throws with a message fit for the terminal: in CI a missing or broken
// baseline must stop the run, never be read as "nothing is known".
export function readBaseline(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch {
    throw new Error(
      `Baseline not found: ${file}. Create it with --baseline ${file} --update-baseline.`,
    );
  }
  let baseline;
  try {
    baseline = JSON.parse(raw);
  } catch {
    throw new Error(`Baseline is not valid JSON: ${file}`);
  }
  if (baseline?.version !== VERSION || !Array.isArray(baseline.findings)) {
    throw new Error(`Baseline has an unknown format: ${file}`);
  }
  return baseline;
}

// Marks each violation v.baseline = "new" | "known" and returns the summary.
// `fixed` lists baseline findings this scan no longer has.
export function compareToBaseline(results, baseline) {
  let accepted = baseline.findings;
  let pending = results.violations.map((v) => [v, entry(v)]);
  for (const pass of PASSES) {
    const pool = new Map();
    for (const f of accepted) pool.set(pass(f), [...(pool.get(pass(f)) || []), f]);
    const unmatched = [];
    for (const [v, f] of pending) {
      const left = pool.get(pass(f));
      if (left?.length) {
        left.pop();
        v.baseline = "known";
      } else unmatched.push([v, f]);
    }
    pending = unmatched;
    accepted = [...pool.values()].flat();
  }
  for (const [v] of pending) v.baseline = "new";
  return {
    known: results.violations.length - pending.length,
    new: pending.length,
    fixed: accepted,
    urlMismatch:
      baseline.url && baseline.url !== results.url ? baseline.url : null,
  };
}
