/**
 * CI gating: decide whether a scan's results should fail the build.
 * Pure functions over the `stats` object produced by the scanner so they are
 * trivially testable and reusable by future commands.
 */

const RANK = { critical: 3, moderate: 2, minor: 1 };

export const GATE_SEVERITIES = Object.keys(RANK);

/** Count violations whose severity is at or above `severity`. */
export function countAtOrAbove(stats, severity) {
  const min = RANK[severity];
  if (min == null) {
    throw new Error(
      `Invalid severity "${severity}". Use one of: ${GATE_SEVERITIES.join(", ")}.`,
    );
  }
  let count = 0;
  for (const [name, rank] of Object.entries(RANK)) {
    if (rank >= min) count += stats[name] ?? 0;
  }
  return count;
}

/**
 * @returns {{ count: number, failed: boolean }} `count` violations at/above
 * `failOn`; `failed` when that exceeds `threshold`.
 */
export function evaluateGate(stats, { failOn = "critical", threshold = 0 } = {}) {
  const count = countAtOrAbove(stats, failOn);
  return { count, failed: count > threshold };
}
