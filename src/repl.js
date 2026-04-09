import readline from "node:readline";
import { startDaemon, connectBrowser, stopDaemon } from "./daemon.js";
import { createBridge } from "./bridge.js";

const HELP = `
Commands:
  page open <url>       Open a URL or local HTML file
  page info             Show current page info
  nav next              Move to next element
  nav previous          Move to previous element
  nav heading           Move to next heading
  nav landmark          Move to next landmark
  nav link              Move to next link
  nav form              Move to next form
  speak last            Last spoken phrase
  speak log             Full spoken phrase log
  speak find <text>     Search for text in spoken output
  screenshot [path]     Screenshot current element
  screenshot --full [p] Screenshot full page
  audit                 Full page traversal
  help                  Show this help
  quit                  Exit
`.trim();

const NAV_COMMANDS = {
  heading: "moveToNextHeading",
  landmark: "moveToNextLandmark",
  link: "moveToNextLink",
  form: "moveToNextForm",
};

export async function startRepl() {
  await startDaemon();
  const browser = await connectBrowser();
  const bridge = await createBridge(browser);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "screenreader> ",
  });

  console.log("Screen Reader CLI — Interactive Mode");
  console.log('Type "help" for commands, "quit" to exit.\n');
  rl.prompt();

  rl.on("line", async (line) => {
    const parts = line.trim().split(/\s+/);
    const [group, cmd, ...rest] = parts;

    try {
      if (!group || group === "") {
        // empty line
      } else if (group === "quit" || group === "exit") {
        await bridge.close();
        await browser.close();
        await stopDaemon();
        rl.close();
        return;
      } else if (group === "help") {
        console.log(HELP);
      } else if (group === "page" && cmd === "open" && rest[0]) {
        await bridge.openPage(rest[0]);
        const info = await bridge.pageInfo();
        console.log(`Opened: ${info.title} (${info.url})`);
      } else if (group === "page" && cmd === "info") {
        const info = await bridge.pageInfo();
        console.log(`${info.title} — ${info.url}`);
      } else if (group === "nav" && cmd === "next") {
        console.log(await bridge.next());
      } else if (group === "nav" && cmd === "previous") {
        console.log(await bridge.previous());
      } else if (group === "nav" && NAV_COMMANDS[cmd]) {
        console.log(await bridge.perform(NAV_COMMANDS[cmd]));
      } else if (group === "speak" && cmd === "last") {
        console.log(await bridge.lastSpokenPhrase());
      } else if (group === "speak" && cmd === "log") {
        const log = await bridge.spokenPhraseLog();
        log.forEach((p, i) => console.log(`${i + 1}. ${p}`));
      } else if (group === "speak" && cmd === "find" && rest[0]) {
        const target = rest.join(" ").toLowerCase();
        for (let i = 0; i < 100; i++) {
          const phrase = await bridge.next();
          if (phrase.toLowerCase().includes(target)) {
            console.log(`Found (step ${i + 1}): ${phrase}`);
            rl.prompt();
            return;
          }
        }
        console.log(`"${rest.join(" ")}" not found in first 100 elements`);
      } else if (group === "screenshot") {
        const isFull = cmd === "--full";
        const outPath = (isFull ? rest[0] : cmd) || "screenshot.png";
        if (isFull) {
          await bridge.screenshotFullPage(outPath);
        } else {
          await bridge.screenshotActiveNode(outPath);
        }
        console.log(`Screenshot saved: ${outPath}`);
      } else if (group === "audit") {
        const phrases = [];
        for (let i = 0; i < 500; i++) {
          const phrase = await bridge.next();
          phrases.push(phrase);
          console.log(phrase);
          if (phrase === "end of document") break;
        }
        console.log(`\n(${phrases.length} elements traversed)`);
      } else {
        console.log(`Unknown command: ${line.trim()}. Type "help" for commands.`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    await bridge.close();
    await browser.close();
    await stopDaemon();
    process.exit(0);
  });
}
