#!/usr/bin/env node
// `sr` — the short way in. With no arguments (or only flags, like
// `sr --port 5000`) it opens the dashboard — the most common thing to
// want. With a subcommand it behaves exactly like `screenreader`, so
// `sr scan <url>` works too.
const args = process.argv.slice(2);
const passthrough = ["-h", "--help", "-V", "--version"];
const wantsDashboard =
  args.length === 0 ||
  (args[0].startsWith("-") && !passthrough.includes(args[0]));
if (wantsDashboard) {
  process.argv.splice(2, 0, "dashboard");
}
await import("./cli.js");
