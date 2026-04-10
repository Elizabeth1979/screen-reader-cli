export function generateScanReport(results) {
  const severityColor = { critical: "#d32f2f", moderate: "#f57c00", minor: "#1976d2" };
  const severityLabel = { critical: "Critical", moderate: "Moderate", minor: "Minor" };

  const violationRows = results.violations
    .map(
      (v) => `
    <tr>
      <td><span class="badge" style="background:${severityColor[v.severity]}">${severityLabel[v.severity]}</span></td>
      <td>${esc(v.message)}</td>
      <td><code>${esc(v.element?.selector || "")}</code></td>
      <td>${v.wcag ? "WCAG " + esc(v.wcag) : ""}</td>
      <td>${esc(v.suggestion || "")}</td>
      <td>${v.source}</td>
    </tr>`
    )
    .join("\n");

  const domOrderItems = results.domOrder
    .slice(0, 200)
    .map(
      (el, i) =>
        `<li><strong>${i + 1}.</strong> &lt;${esc(el.tag)}${el.role ? ' role="' + esc(el.role) + '"' : ""}&gt; ${esc(el.name.slice(0, 80))}</li>`
    )
    .join("\n");

  const headingTree = results.headings
    .map(
      (h) =>
        `<li style="margin-left:${(h.level - 1) * 20}px"><strong>h${h.level}</strong> ${esc(h.text.slice(0, 80))}</li>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Screen Reader Scan: ${esc(results.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d1117; color: #e6edf3; padding: 24px; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    h2 { font-size: 1.2rem; margin: 32px 0 12px; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
    .meta { color: #8b949e; margin-bottom: 24px; }
    .stats { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0 24px; }
    .stat { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 20px; text-align: center; min-width: 100px; }
    .stat .num { font-size: 2rem; font-weight: 700; }
    .stat .label { font-size: 0.8rem; color: #8b949e; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #21262d; }
    th { background: #161b22; color: #8b949e; font-size: 0.85rem; }
    code { background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
    .badge { color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    ul { list-style: none; padding: 0; }
    li { padding: 4px 0; font-size: 0.9rem; }
    .section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .screenshot { max-width: 100%; border: 1px solid #30363d; border-radius: 8px; margin: 12px 0; }
    .pass { color: #3fb950; }
    details { margin: 8px 0; }
    summary { cursor: pointer; padding: 8px 0; }
  </style>
</head>
<body>
  <h1>Screen Reader Scan Report</h1>
  <p class="meta">${esc(results.title)} — <a href="${esc(results.url)}" style="color:#58a6ff">${esc(results.url)}</a></p>

  <div class="stats">
    <div class="stat">
      <div class="num" style="color:${results.stats.critical > 0 ? "#d32f2f" : "#3fb950"}">${results.stats.violationCount}</div>
      <div class="label">Issues</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#d32f2f">${results.stats.critical}</div>
      <div class="label">Critical</div>
    </div>
    <div class="stat">
      <div class="num" style="color:#f57c00">${results.stats.moderate}</div>
      <div class="label">Moderate</div>
    </div>
    <div class="stat">
      <div class="num">${results.stats.domElements}</div>
      <div class="label">DOM Elements</div>
    </div>
    <div class="stat">
      <div class="num">${results.stats.headingCount}</div>
      <div class="label">Headings</div>
    </div>
    <div class="stat">
      <div class="num">${results.stats.landmarkCount}</div>
      <div class="label">Landmarks</div>
    </div>
  </div>

  ${
    results.stats.violationCount === 0
      ? '<p class="pass">No screen reader violations found.</p>'
      : `
  <h2>Issues Found</h2>
  <div class="section">
    <table>
      <thead><tr><th>Severity</th><th>Issue</th><th>Element</th><th>WCAG</th><th>Suggestion</th><th>Source</th></tr></thead>
      <tbody>${violationRows}</tbody>
    </table>
  </div>`
  }

  <h2>Heading Structure</h2>
  <div class="section">
    ${headingTree.length > 0 ? `<ul>${headingTree}</ul>` : "<p>No headings found.</p>"}
  </div>

  <details>
    <summary><h2 style="display:inline">DOM Reading Order (first 200 elements)</h2></summary>
    <div class="section">
      <ul>${domOrderItems}</ul>
      ${results.domOrder.length > 200 ? `<p style="color:#8b949e;margin-top:8px">... and ${results.domOrder.length - 200} more</p>` : ""}
    </div>
  </details>

  <details>
    <summary><h2 style="display:inline">Page Screenshot</h2></summary>
    <img class="screenshot" src="data:image/png;base64,${results.screenshot}" alt="Full page screenshot of ${esc(results.title)}">
  </details>

  <p style="color:#8b949e;margin-top:32px;font-size:0.8rem">Generated by screen-reader-cli</p>
</body>
</html>`;
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
