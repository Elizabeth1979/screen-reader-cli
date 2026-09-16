import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBundledAsset } from "../src/util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

// Every dependency file we read off disk at startup. Add to this list rather
// than reaching into node_modules from a new module.
const BUNDLED_ASSETS = [
  "@guidepup/virtual-screen-reader/browser.js",
  "axe-core/axe.min.js",
];

describe("bundled asset resolution", () => {
  for (const specifier of BUNDLED_ASSETS) {
    it(`resolves ${specifier} to a real file`, () => {
      const resolved = resolveBundledAsset(specifier);
      assert.ok(path.isAbsolute(resolved), "should be an absolute path");
      assert.ok(fs.existsSync(resolved), `${resolved} does not exist`);
      assert.ok(fs.statSync(resolved).size > 0, "should not be empty");
    });
  }

  it("throws a named error for a dependency we do not have", () => {
    assert.throws(
      () => resolveBundledAsset("not-a-real-package/nope.js"),
      /MODULE_NOT_FOUND|Cannot find/,
    );
  });
});

describe("no module hardcodes a dependency's location on disk", () => {
  // The guard that generalises past the two known cases: a path built by hand
  // assumes a layout the package manager is free to change, and the failure is
  // an ENOENT at import time rather than anything actionable.
  it("no file under src/ mentions node_modules", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".js")) {
          const text = fs.readFileSync(full, "utf-8");
          // The explanatory comment in util.js is allowed to name the pattern.
          const code = text
            .split("\n")
            .filter((line) => !/^\s*(\*|\/\/)/.test(line))
            .join("\n");
          if (code.includes("node_modules")) {
            offenders.push(path.relative(REPO, full));
          }
        }
      }
    };
    walk(path.join(REPO, "src"));
    assert.deepEqual(
      offenders,
      [],
      `use resolveBundledAsset() instead of a hand-built path in: ${offenders.join(", ")}`,
    );
  });
});

// The actual bug from issue #18, reproduced: installed as a dependency rather
// than globally, npm hoists our dependencies to a shared parent and our own
// folder has no node_modules at all. A hand-built "../node_modules/..." path
// does not exist in that layout, so every command — even --help — died at
// import time with a raw ENOENT.
describe("the CLI runs when dependencies are hoisted above it", () => {
  let tmp;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sr-hoisted-"));
    const sharedModules = path.join(tmp, "node_modules");
    fs.mkdirSync(sharedModules);

    // Link every dependency into the SHARED parent, mirroring what npm does
    // when this package is a dependency of something else.
    for (const entry of fs.readdirSync(path.join(REPO, "node_modules"), {
      withFileTypes: true,
    })) {
      if (entry.name === ".bin" || entry.name === ".package-lock.json")
        continue;
      const from = path.join(REPO, "node_modules", entry.name);
      if (entry.name.startsWith("@")) {
        // Scoped packages nest one level deeper.
        const scopeDir = path.join(sharedModules, entry.name);
        fs.mkdirSync(scopeDir, { recursive: true });
        for (const scoped of fs.readdirSync(from)) {
          fs.symlinkSync(path.join(from, scoped), path.join(scopeDir, scoped));
        }
      } else {
        fs.symlinkSync(from, path.join(sharedModules, entry.name));
      }
    }

    // Copy (never symlink) our own code: Node resolves a symlink to its real
    // location, which would walk back into the repo's own node_modules and
    // hide the very layout this test exists to create.
    const pkgDir = path.join(sharedModules, "screen-reader-cli");
    fs.mkdirSync(pkgDir);
    for (const item of ["bin", "src", "package.json"]) {
      fs.cpSync(path.join(REPO, item), path.join(pkgDir, item), {
        recursive: true,
      });
    }
    assert.ok(
      !fs.existsSync(path.join(pkgDir, "node_modules")),
      "the package must have no node_modules of its own for this test to mean anything",
    );
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("prints help instead of crashing at import time", () => {
    const cli = path.join(tmp, "node_modules/screen-reader-cli/bin/cli.js");
    const out = execFileSync("node", [cli, "audit", "--help"], {
      encoding: "utf-8",
      timeout: 60_000,
      env: { ...process.env, SR_NO_OPEN: "1" },
    });
    assert.match(out, /--device/, "should reach argument parsing");
  });
});
