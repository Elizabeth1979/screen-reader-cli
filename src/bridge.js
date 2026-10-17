import fs from "node:fs";
import { resolveDeviceOptions, resolveTarget } from "./util.js";

// Guidepup's virtual screen reader, built as one plain script by
// scripts/build-virtual-screen-reader.mjs (`npm run build`, run by `prepare`)
// and shipped in the package. Read once, on first use, so `--help` still works
// in a checkout where it has not been built.
const VSR_SCRIPT_URL = new URL(
  "../dist/guidepup-virtual-screen-reader.js",
  import.meta.url,
);
// Must match GLOBAL_NAME in the build script.
const VSR_GLOBAL = "__srCliGuidepupVirtualScreenReader";
let vsrScript = null;
function readVirtualScreenReader() {
  if (vsrScript === null) {
    try {
      vsrScript = fs.readFileSync(VSR_SCRIPT_URL, "utf-8");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      throw new Error(
        "The virtual screen reader has not been built. Run `npm install` " +
          "(or `npm run build`) in this checkout.",
      );
    }
  }
  return vsrScript;
}

// Load the Virtual Screen Reader into the page as window.__vsr — the one
// loader every command uses. The plain script is evaluated over the DevTools
// protocol, which a page's Content-Security-Policy does not govern, so it runs
// on a page that forbids every script while the page's own policy stays on.
// Same approach as Deque's official @axe-core/playwright, which loads axe with
// `page.evaluate(this.script())` (and as runAxe in services/scanner.js).
export async function injectVirtualScreenReader(page) {
  if (await page.evaluate(() => Boolean(window.__vsr))) return;
  await page.evaluate(readVirtualScreenReader());
  await page.evaluate((name) => {
    window.__vsr = window[name].virtual;
  }, VSR_GLOBAL);
}

export async function createBridge(browser, opts = {}) {
  // A page that renders different markup for phones cannot be audited under a
  // desktop user agent: the traversal comes back clean because the mobile
  // branch never rendered. `opts.device` / `opts.userAgent` override it.
  const context = await browser.newContext({
    ...resolveDeviceOptions(opts),
    ...(opts.recordVideo ? { recordVideo: opts.recordVideo } : {}),
  });
  // Seed localStorage before any page script runs, so authenticated SPAs
  // (e.g. apps that read an access token from localStorage on boot) render
  // their logged-in state instead of redirecting to a login page.
  // sessionStorage alongside it: components that gate content on prior-session
  // data (recent searches, a dismissed banner) read that store instead, and
  // without it their populated state is unreachable.
  if (opts.localStorage?.length || opts.sessionStorage?.length) {
    await context.addInitScript(
      ({ local, session }) => {
        for (const [key, value] of local) {
          window.localStorage.setItem(key, value);
        }
        for (const [key, value] of session) {
          window.sessionStorage.setItem(key, value);
        }
      },
      { local: opts.localStorage ?? [], session: opts.sessionStorage ?? [] },
    );
  }
  let page = null;
  let vsrStarted = false;

  async function ensureStarted() {
    if (!vsrStarted) {
      await page.evaluate(async () => {
        await window.__vsr.start({ container: document.body });
      });
      vsrStarted = true;
    }
  }

  return {
    async openPage(url) {
      if (page) {
        if (vsrStarted) {
          await page
            .evaluate(async () => {
              await window.__vsr.stop();
            })
            .catch(() => {});
          vsrStarted = false;
        }
      } else {
        page = await context.newPage();
      }
      await page.goto(resolveTarget(url), { waitUntil: "domcontentloaded" });
      await injectVirtualScreenReader(page);
      await ensureStarted();
    },

    async pageInfo() {
      return page.evaluate(() => ({
        url: window.location.href,
        title: document.title,
      }));
    },

    async next() {
      await ensureStarted();
      return page.evaluate(async () => {
        await window.__vsr.next();
        return window.__vsr.lastSpokenPhrase();
      });
    },

    async previous() {
      await ensureStarted();
      return page.evaluate(async () => {
        await window.__vsr.previous();
        return window.__vsr.lastSpokenPhrase();
      });
    },

    async perform(commandName) {
      await ensureStarted();
      return page.evaluate(async (cmd) => {
        const command = window.__vsr.commands[cmd];
        if (!command) throw new Error(`Unknown command: ${cmd}`);
        await window.__vsr.perform(command);
        return window.__vsr.lastSpokenPhrase();
      }, commandName);
    },

    async lastSpokenPhrase() {
      return page.evaluate(async () => window.__vsr.lastSpokenPhrase());
    },

    async spokenPhraseLog() {
      return page.evaluate(async () => window.__vsr.spokenPhraseLog());
    },

    async itemText() {
      return page.evaluate(async () => window.__vsr.itemText());
    },

    async act() {
      return page.evaluate(async () => {
        await window.__vsr.act();
        return window.__vsr.lastSpokenPhrase();
      });
    },

    async type(text) {
      return page.evaluate(async (t) => {
        await window.__vsr.type(t);
        return window.__vsr.lastSpokenPhrase();
      }, text);
    },

    async press(key) {
      return page.evaluate(async (k) => {
        await window.__vsr.press(k);
        return window.__vsr.lastSpokenPhrase();
      }, key);
    },

    async activeNodeInfo() {
      return page.evaluate(() => {
        const node = window.__vsr.activeNode;
        if (!node) return { tagName: null, role: null, name: null };
        return {
          tagName: node.tagName || node.nodeName,
          role: node.getAttribute?.("role") || null,
          name:
            node.getAttribute?.("aria-label") ||
            node.textContent?.slice(0, 100) ||
            null,
        };
      });
    },

    async screenshotActiveNode(outputPath) {
      const handle = await page.evaluateHandle(() => {
        const node = window.__vsr.activeNode;
        return node instanceof Element
          ? node
          : node?.parentElement || document.body;
      });
      const element = handle.asElement();
      if (element) {
        await element.screenshot({ path: outputPath });
        return outputPath;
      }
      await page.screenshot({ path: outputPath });
      return outputPath;
    },

    async screenshotFullPage(outputPath) {
      await page.screenshot({ path: outputPath, fullPage: true });
      return outputPath;
    },

    getPage() {
      return page;
    },

    async close() {
      if (vsrStarted && page) {
        await page
          .evaluate(async () => {
            await window.__vsr.stop();
          })
          .catch(() => {});
      }
      await context.close();
    },
  };
}
