import { Command } from "commander";
import { startDaemon, connectBrowser, stopDaemon } from "../daemon.js";
import { createBridge } from "../bridge.js";

async function withNav(url, fn) {
  await startDaemon();
  const browser = await connectBrowser();
  const bridge = await createBridge(browser);
  try {
    if (url) await bridge.openPage(url);
    const phrase = await fn(bridge);
    const nodeInfo = await bridge.activeNodeInfo();
    return { phrase, node: nodeInfo };
  } finally {
    await bridge.close();
    await browser.close();
    await stopDaemon();
  }
}

function navAction(fn) {
  return async (opts) => {
    const result = await withNav(opts.url, fn);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.phrase);
    }
  };
}

export function navCommand() {
  const nav = new Command("nav").description("Navigate through page elements");

  const sharedOpts = (cmd) =>
    cmd.option("--url <url>", "Open this URL first").option("--json", "Output as JSON");

  sharedOpts(
    nav.command("next").description("Move to next element")
  ).action(navAction((bridge) => bridge.next()));

  sharedOpts(
    nav.command("previous").description("Move to previous element")
  ).action(navAction((bridge) => bridge.previous()));

  sharedOpts(
    nav.command("heading").description("Move to next heading")
  ).action(navAction((bridge) => bridge.perform("moveToNextHeading")));

  sharedOpts(
    nav.command("landmark").description("Move to next landmark")
  ).action(navAction((bridge) => bridge.perform("moveToNextLandmark")));

  sharedOpts(
    nav.command("link").description("Move to next link")
  ).action(navAction((bridge) => bridge.perform("moveToNextLink")));

  sharedOpts(
    nav.command("form").description("Move to next form")
  ).action(navAction((bridge) => bridge.perform("moveToNextForm")));

  return nav;
}
