export function generateScanReport(results, { aiAnalysis, aiMeta } = {}) {
  const severityColor = { critical: "#FF4D4F", moderate: "#FA8C16", minor: "#1890FF" };
  const severityBg = { critical: "rgba(255,77,79,0.08)", moderate: "rgba(250,140,22,0.08)", minor: "rgba(24,144,255,0.08)" };
  const severityIcon = { critical: "\u26A0", moderate: "\u25C6", minor: "\u25CB" };

  // Score: use AI score if available, otherwise compute from violation counts
  const hasAI = aiAnalysis && typeof aiAnalysis === "object";
  const aiFixes = hasAI && Array.isArray(aiAnalysis.fixes) ? aiAnalysis.fixes : [];
  const aiFixMap = {};
  for (const f of aiFixes) aiFixMap[f.index] = f;

  const rawScore = hasAI && aiAnalysis.score != null
    ? aiAnalysis.score
    : Math.max(0, 10 - (results.stats.critical * 2 + results.stats.moderate * 0.5 + results.stats.minor * 0.1));
  const score = Math.round(rawScore * 10) / 10;
  const scoreColor = score >= 7 ? "#52C41A" : score >= 4 ? "#FA8C16" : "#FF4D4F";
  const scorePercent = (score / 10) * 100;
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (scorePercent / 100) * circumference;

  const severityWeight = { critical: 0, moderate: 1, minor: 2 };
  const hasAIFixes = aiFixes.length > 0;

  const violationRows = results.violations
    .map(
      (v, i) => {
        const af = aiFixMap[i];
        return `
        <tr data-severity="${v.severity}" data-severity-weight="${severityWeight[v.severity]}" data-wcag="${esc(v.wcag || "")}" data-source="${esc(v.source || "")}">
          <td class="col-severity"><span class="severity-badge" style="background:${severityColor[v.severity]}">${v.severity}</span></td>
          <td class="col-issue">
            <div class="issue-message">${esc(v.message)}</div>
            ${v.element?.selector ? `<code class="issue-selector">${esc(v.element.selector)}</code>` : ""}
          </td>
          <td class="col-fix">${af ? `<div class="ai-fix">${esc(af.fix)}</div>${af.impact ? `<div class="ai-impact">${esc(af.impact)}</div>` : ""}` : (v.suggestion ? `<div class="fallback-fix">${esc(v.suggestion)}</div>` : "\u2014")}</td>
          <td class="col-wcag">${v.wcag ? esc(v.wcag) : "\u2014"}</td>
          <td class="col-source">${esc(v.source || "")}</td>
        </tr>`;
      }
    )
    .join("\n");

  const headingTree = results.headings
    .map(
      (h) =>
        `<div class="heading-item" style="padding-left:${(h.level - 1) * 24}px">
          <span class="heading-level">H${h.level}</span>
          <span class="heading-text">${esc(h.text.slice(0, 100))}</span>
        </div>`
    )
    .join("\n");

  const domOrderItems = results.domOrder
    .slice(0, 150)
    .map(
      (el, i) =>
        `<div class="dom-item">
          <span class="dom-index">${i + 1}</span>
          <span class="dom-tag">&lt;${esc(el.tag)}${el.role ? ' role="' + esc(el.role) + '"' : ""}&gt;</span>
          <span class="dom-name">${esc(el.name.slice(0, 60))}</span>
        </div>`
    )
    .join("\n");

  const aiSummaryBanner = (hasAI && aiAnalysis.summary)
    ? `
  <div class="ai-banner" style="--delay:0.15s">
    <div class="ai-banner-icon">\u2728</div>
    <div class="ai-banner-body">
      <p class="ai-banner-text">${esc(aiAnalysis.summary)}</p>
      ${aiMeta ? `<span class="ai-banner-meta">${esc(aiMeta.provider)} / ${esc(aiMeta.model)}</span>` : ""}
    </div>
  </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accessibility Report: ${esc(results.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=JetBrains+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,700;1,9..144,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-deep: #0A0C10;
      --bg-surface: #12151C;
      --bg-elevated: #1A1E28;
      --bg-hover: #222733;
      --border: #2A2F3C;
      --border-subtle: #1E2230;
      --text-primary: #E8ECF4;
      --text-secondary: #8B92A8;
      --text-muted: #5C6378;
      --accent: #6C8AFF;
      --accent-dim: rgba(108,138,255,0.12);
      --critical: #FF4D4F;
      --moderate: #FA8C16;
      --minor: #1890FF;
      --success: #52C41A;
      --font-body: 'DM Sans', system-ui, sans-serif;
      --font-display: 'Fraunces', Georgia, serif;
      --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
      --radius: 12px;
      --radius-sm: 8px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-body);
      background: var(--bg-deep);
      color: var(--text-primary);
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Noise texture overlay ────────────────── */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      opacity: 0.025;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      background-size: 256px;
      pointer-events: none;
      z-index: 9999;
    }

    /* ── Layout ────────────────────────────────── */
    .container {
      max-width: 960px;
      margin: 0 auto;
      padding: 48px 24px 80px;
    }

    /* ── Header ────────────────────────────────── */
    .report-header {
      margin-bottom: 48px;
      animation: fadeUp 0.6s ease both;
    }

    .report-header .eyebrow {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 12px;
    }

    .report-header h1 {
      font-family: var(--font-display);
      font-size: clamp(1.8rem, 4vw, 2.6rem);
      font-weight: 700;
      font-style: italic;
      line-height: 1.15;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .report-header .url {
      font-family: var(--font-mono);
      font-size: 0.82rem;
      color: var(--text-muted);
      word-break: break-all;
    }

    .report-header .url a {
      color: var(--text-secondary);
      text-decoration: none;
      border-bottom: 1px solid var(--border);
      transition: color 0.2s, border-color 0.2s;
    }
    .report-header .url a:hover {
      color: var(--accent);
      border-color: var(--accent);
    }

    /* ── Score + Stats hero ───────────────────── */
    .hero {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 40px;
      align-items: center;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius);
      padding: 32px 36px;
      margin-bottom: 40px;
      animation: fadeUp 0.6s 0.1s ease both;
    }

    .score-ring {
      position: relative;
      width: 130px;
      height: 130px;
    }

    .score-ring svg {
      transform: rotate(-90deg);
      width: 130px;
      height: 130px;
    }

    .score-ring .track {
      fill: none;
      stroke: var(--bg-elevated);
      stroke-width: 8;
    }

    .score-ring .progress {
      fill: none;
      stroke: ${scoreColor};
      stroke-width: 8;
      stroke-linecap: round;
      stroke-dasharray: ${circumference};
      stroke-dashoffset: ${circumference};
      animation: scoreReveal 1.2s 0.6s ease forwards;
    }

    .score-ring .score-label {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .score-ring .score-num {
      font-family: var(--font-display);
      font-size: 2.4rem;
      font-weight: 700;
      color: ${scoreColor};
      line-height: 1;
    }

    .score-ring .score-max {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    @keyframes scoreReveal {
      to { stroke-dashoffset: ${dashOffset}; }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 16px;
    }

    .stat-item {
      text-align: center;
      padding: 12px 8px;
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
    }

    .stat-item .stat-num {
      font-family: var(--font-display);
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .stat-item .stat-label {
      font-size: 0.72rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-top: 2px;
    }

    /* ── Sections ──────────────────────────────── */
    .report-section {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius);
      margin-bottom: 24px;
      overflow: hidden;
      animation: fadeUp 0.5s ease both;
      animation-delay: var(--delay, 0s);
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 28px;
      border-bottom: 1px solid var(--border-subtle);
      flex-wrap: wrap;
    }

    .section-header h2 {
      font-family: var(--font-body);
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .section-body {
      padding: 20px 28px 28px;
    }

    /* ── Filter pills ──────────────────────────── */
    .table-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .filter-pills {
      display: flex;
      gap: 6px;
    }

    .filter-pill {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      letter-spacing: 0.03em;
      color: var(--text-muted);
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 4px 14px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .filter-pill:hover {
      color: var(--text-primary);
      border-color: var(--text-muted);
    }

    .filter-pill.active {
      color: #fff;
      background: var(--pill-color, var(--accent));
      border-color: var(--pill-color, var(--accent));
    }

    .pill-count {
      opacity: 0.7;
      margin-left: 2px;
    }

    /* ── Issues table ──────────────────────────── */
    .table-wrap {
      overflow-x: auto;
    }

    .issues-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .issues-table thead th {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
      text-align: left;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-elevated);
      white-space: nowrap;
      user-select: none;
    }

    .issues-table thead th.sortable {
      cursor: pointer;
      transition: color 0.15s;
    }

    .issues-table thead th.sortable:hover {
      color: var(--text-primary);
    }

    .issues-table thead th[aria-sort="ascending"] .sort-icon,
    .issues-table thead th[aria-sort="descending"] .sort-icon {
      color: var(--accent);
    }

    .sort-icon {
      font-size: 0.6rem;
      color: var(--border);
      margin-left: 4px;
    }

    .issues-table tbody tr {
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.12s;
    }

    .issues-table tbody tr:hover {
      background: var(--bg-hover);
    }

    .issues-table tbody tr.hidden {
      display: none;
    }

    .issues-table tbody td {
      padding: 14px 16px;
      vertical-align: top;
    }

    .col-severity { width: 100px; }
    .col-wcag { width: 90px; font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary); }
    .col-source { width: 90px; font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted); }

    .severity-badge {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #fff;
      padding: 3px 10px;
      border-radius: 4px;
      white-space: nowrap;
    }

    .issue-message {
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .issue-selector {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: 0.76rem;
      color: var(--text-secondary);
      background: var(--bg-elevated);
      padding: 2px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
      word-break: break-all;
    }

    .issue-fix {
      font-size: 0.82rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .issue-fix {
      font-size: 0.84rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* ── Heading structure ─────────────────────── */
    .heading-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .heading-item:last-child { border-bottom: none; }

    .heading-level {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      font-weight: 500;
      color: var(--accent);
      background: var(--accent-dim);
      padding: 2px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .heading-text {
      font-size: 0.88rem;
      color: var(--text-secondary);
    }

    /* ── DOM order ─────────────────────────────── */
    .dom-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 0;
      font-size: 0.82rem;
    }

    .dom-index {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      color: var(--text-muted);
      min-width: 28px;
      text-align: right;
    }

    .dom-tag {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      color: var(--accent);
    }

    .dom-name {
      color: var(--text-secondary);
      font-size: 0.82rem;
    }

    /* ── AI Summary banner ─────────────────────── */
    .ai-banner {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      background: var(--accent-dim);
      border: 1px solid rgba(108,138,255,0.2);
      border-radius: var(--radius);
      padding: 20px 24px;
      margin-bottom: 24px;
      animation: fadeUp 0.5s ease both;
      animation-delay: var(--delay, 0s);
    }

    .ai-banner-icon {
      font-size: 1.3rem;
      line-height: 1;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .ai-banner-body { flex: 1; }

    .ai-banner-text {
      font-size: 0.9rem;
      color: var(--text-primary);
      line-height: 1.6;
      margin-bottom: 6px;
    }

    .ai-banner-meta {
      font-family: var(--font-mono);
      font-size: 0.68rem;
      color: var(--text-muted);
    }

    /* ── Fix column in table ───────────────────── */
    .col-fix {
      min-width: 200px;
    }

    .ai-fix {
      font-size: 0.84rem;
      color: var(--text-primary);
      line-height: 1.5;
      margin-bottom: 4px;
    }

    .ai-impact {
      font-size: 0.78rem;
      color: var(--text-muted);
      font-style: italic;
      line-height: 1.4;
    }

    .fallback-fix {
      font-size: 0.82rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* ── Collapsible ───────────────────────────── */
    details { margin: 0; }

    details summary {
      cursor: pointer;
      list-style: none;
      padding: 20px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.15s;
    }

    details summary:hover { background: var(--bg-hover); }

    details summary::-webkit-details-marker { display: none; }
    details summary::marker { display: none; }

    details summary h2 {
      font-family: var(--font-body);
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    details summary .chevron {
      color: var(--text-muted);
      transition: transform 0.25s ease;
      font-size: 0.8rem;
    }

    details[open] summary .chevron { transform: rotate(90deg); }

    details .section-body {
      border-top: 1px solid var(--border-subtle);
    }

    /* ── Screenshot ─────────────────────────────── */
    .screenshot-img {
      max-width: 100%;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
    }

    /* ── No issues state ───────────────────────── */
    .clean-state {
      text-align: center;
      padding: 48px 24px;
    }

    .clean-state .icon {
      font-size: 3rem;
      margin-bottom: 12px;
    }

    .clean-state p {
      color: var(--success);
      font-size: 1.1rem;
      font-weight: 500;
    }

    /* ── Footer ────────────────────────────────── */
    .report-footer {
      text-align: center;
      padding: 32px 0;
      font-family: var(--font-mono);
      font-size: 0.7rem;
      color: var(--text-muted);
      letter-spacing: 0.04em;
    }

    /* ── Animations ─────────────────────────────── */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ── Responsive ─────────────────────────────── */
    @media (max-width: 640px) {
      .hero { grid-template-columns: 1fr; justify-items: center; text-align: center; }
      .stats-grid { grid-template-columns: repeat(3, 1fr); }
      .section-header, .section-body, details summary { padding-left: 16px; padding-right: 16px; }
      .issue-card { padding: 12px 14px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="report-header">
      <div class="eyebrow">Screen Reader Accessibility Report</div>
      <h1>${esc(results.title)}</h1>
      <p class="url"><a href="${esc(results.url)}">${esc(results.url)}</a></p>
    </header>

    <div class="hero">
      <div class="score-ring">
        <svg viewBox="0 0 120 120">
          <circle class="track" cx="60" cy="60" r="54" />
          <circle class="progress" cx="60" cy="60" r="54" />
        </svg>
        <div class="score-label">
          <span class="score-num">${score}</span>
          <span class="score-max">/ 10</span>
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-num" style="color:${results.stats.critical > 0 ? "var(--critical)" : "var(--success)"}">${results.stats.violationCount}</div>
          <div class="stat-label">Issues</div>
        </div>
        <div class="stat-item">
          <div class="stat-num" style="color:var(--critical)">${results.stats.critical}</div>
          <div class="stat-label">Critical</div>
        </div>
        <div class="stat-item">
          <div class="stat-num" style="color:var(--moderate)">${results.stats.moderate}</div>
          <div class="stat-label">Moderate</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">${results.stats.domElements}</div>
          <div class="stat-label">DOM Elements</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">${results.stats.headingCount}</div>
          <div class="stat-label">Headings</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">${results.stats.landmarkCount}</div>
          <div class="stat-label">Landmarks</div>
        </div>
      </div>
    </div>

    ${aiSummaryBanner}

    ${
      results.stats.violationCount === 0
        ? `<section class="report-section" style="--delay:0.2s">
            <div class="clean-state">
              <div class="icon">\u2713</div>
              <p>No screen reader violations found.</p>
            </div>
          </section>`
        : `<section class="report-section" style="--delay:0.2s">
            <div class="section-header">
              <h2>Issues Found</h2>
              <div class="table-controls">
                <div class="filter-pills">
                  <button class="filter-pill active" data-filter="all">All <span class="pill-count">${results.stats.violationCount}</span></button>
                  ${results.stats.critical > 0 ? `<button class="filter-pill" data-filter="critical" style="--pill-color:var(--critical)">Critical <span class="pill-count">${results.stats.critical}</span></button>` : ""}
                  ${results.stats.moderate > 0 ? `<button class="filter-pill" data-filter="moderate" style="--pill-color:var(--moderate)">Moderate <span class="pill-count">${results.stats.moderate}</span></button>` : ""}
                  ${results.stats.minor > 0 ? `<button class="filter-pill" data-filter="minor" style="--pill-color:var(--minor)">Minor <span class="pill-count">${results.stats.minor}</span></button>` : ""}
                </div>
              </div>
            </div>
            <div class="table-wrap">
              <table class="issues-table" id="issuesTable">
                <thead>
                  <tr>
                    <th class="sortable col-severity" data-sort="severity-weight" data-type="number" aria-sort="ascending">Severity <span class="sort-icon">\u25B2</span></th>
                    <th class="col-issue">Issue</th>
                    <th class="col-fix">${hasAIFixes ? "AI Fix" : "Suggestion"}</th>
                    <th class="sortable col-wcag" data-sort="wcag" data-type="string">WCAG <span class="sort-icon">\u25BC</span></th>
                    <th class="sortable col-source" data-sort="source" data-type="string">Source <span class="sort-icon">\u25BC</span></th>
                  </tr>
                </thead>
                <tbody>${violationRows}</tbody>
              </table>
            </div>
          </section>`
    }

    <section class="report-section" style="--delay:0.3s">
      <div class="section-header">
        <h2>Heading Structure</h2>
      </div>
      <div class="section-body">
        ${headingTree.length > 0 ? headingTree : '<p style="color:var(--text-muted)">No headings found.</p>'}
      </div>
    </section>

    <div class="report-section" style="--delay:0.35s">
      <details>
        <summary>
          <h2>DOM Reading Order</h2>
          <span class="chevron">\u25B6</span>
        </summary>
        <div class="section-body">
          ${domOrderItems}
          ${results.domOrder.length > 150 ? `<p style="color:var(--text-muted);margin-top:12px;font-size:0.82rem">\u2026 and ${results.domOrder.length - 150} more elements</p>` : ""}
        </div>
      </details>
    </div>

    <div class="report-section" style="--delay:0.4s">
      <details>
        <summary>
          <h2>Page Screenshot</h2>
          <span class="chevron">\u25B6</span>
        </summary>
        <div class="section-body">
          <img class="screenshot-img" src="data:image/png;base64,${results.screenshot}" alt="Full page screenshot of ${esc(results.title)}">
        </div>
      </details>
    </div>

    <footer class="report-footer">
      Generated by screen-reader-cli \u00B7 ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
    </footer>
  </div>

  <script>
  (function() {
    const table = document.getElementById('issuesTable');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const headers = table.querySelectorAll('th.sortable');
    const pills = document.querySelectorAll('.filter-pill');

    // ── Sorting ───────────────────────────────────
    let currentSort = { col: 'severity-weight', dir: 'asc' };

    function sortTable(col, type) {
      const dir = currentSort.col === col && currentSort.dir === 'asc' ? 'desc' : 'asc';
      currentSort = { col, dir };

      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        let va = a.dataset[toCamel(col)] || '';
        let vb = b.dataset[toCamel(col)] || '';
        if (type === 'number') { va = Number(va); vb = Number(vb); }
        else { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
      });

      rows.forEach(r => tbody.appendChild(r));

      headers.forEach(h => {
        const isActive = h.dataset.sort === col;
        h.setAttribute('aria-sort', isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
        h.querySelector('.sort-icon').textContent = isActive ? (dir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BC';
      });
    }

    function toCamel(s) {
      return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }

    headers.forEach(h => {
      h.addEventListener('click', () => sortTable(h.dataset.sort, h.dataset.type));
    });

    // ── Filtering ─────────────────────────────────
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        const filter = pill.dataset.filter;
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => {
          if (filter === 'all' || row.dataset.severity === filter) {
            row.classList.remove('hidden');
          } else {
            row.classList.add('hidden');
          }
        });
      });
    });
  })();
  </script>
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

