import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the VSR browser bundle once at module load time
const VSR_BUNDLE_PATH = path.resolve(
  __dirname,
  "../node_modules/@guidepup/virtual-screen-reader/lib/esm/index.browser.js"
);
const VSR_BUNDLE = fs.readFileSync(VSR_BUNDLE_PATH, "utf-8");

export async function createBridge(browser) {
  const context = await browser.newContext();
  let page = null;
  let vsrStarted = false;

  async function injectVSR() {
    // Inject the VSR bundle as an ESM module via a blob URL
    await page.evaluate(async (bundleSource) => {
      if (window.__vsrLoaded) return;
      const blob = new Blob([bundleSource], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      const module = await import(blobUrl);
      URL.revokeObjectURL(blobUrl);
      window.__vsr = module.virtual;
      window.__vsrLoaded = true;
    }, VSR_BUNDLE);
  }

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
          await page.evaluate(async () => {
            await window.__vsr.stop();
          }).catch(() => {});
          vsrStarted = false;
        }
      } else {
        page = await context.newPage();
      }
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await injectVSR();
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
          name: node.getAttribute?.("aria-label") || node.textContent?.slice(0, 100) || null,
        };
      });
    },

    async screenshotActiveNode(outputPath) {
      const handle = await page.evaluateHandle(() => {
        const node = window.__vsr.activeNode;
        return node instanceof Element ? node : node?.parentElement || document.body;
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
        await page.evaluate(async () => {
          await window.__vsr.stop();
        }).catch(() => {});
      }
      await context.close();
    },
  };
}
