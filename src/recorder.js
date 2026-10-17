// Video of a traversal, for watching the screen reader work instead of reading
// its transcript. The overlay (a box around the current node and a caption bar
// with the spoken phrase) lives on <html>, outside the <body> the virtual
// screen reader traverses, and is aria-hidden — so recording never changes
// what gets announced.

// Long enough to read a caption, short enough that 100 steps stay under 2 min.
export const RECORD_STEP_MS = 800;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export function recordVideoOptions(dir, viewport = DEFAULT_VIEWPORT) {
  return { dir, size: viewport };
}

// Styled through element.style, never a style="" attribute: a page whose
// Content-Security-Policy refuses inline styles drops the attribute (the
// overlay would be an invisible, unstyled box), but it does not govern styles
// set from script.
export async function attachOverlay(page) {
  await page.evaluate(() => {
    const overlay = document.createElement("div");
    overlay.id = "__sr-record";
    overlay.setAttribute("aria-hidden", "true");
    const box = document.createElement("div");
    box.setAttribute("data-box", "");
    Object.assign(box.style, {
      position: "absolute",
      border: "4px solid #fc0",
      borderRadius: "4px",
      pointerEvents: "none",
      zIndex: "2147483646",
    });
    const caption = document.createElement("div");
    caption.setAttribute("data-caption", "");
    Object.assign(caption.style, {
      position: "fixed",
      inset: "auto 0 0 0",
      padding: "14px 20px",
      background: "#000",
      color: "#fc0",
      font: "600 20px/1.35 system-ui,sans-serif",
      borderTop: "3px solid #fc0",
      zIndex: "2147483647",
    });
    overlay.append(box, caption);
    document.documentElement.appendChild(overlay);
  });
}

export async function showStep(page, step, phrase) {
  await page.evaluate(
    ([step, phrase]) => {
      const overlay = document.getElementById("__sr-record");
      let node = window.__vsr.activeNode;
      if (node && !(node instanceof Element)) node = node.parentElement;
      const box = overlay.querySelector("[data-box]");
      if (node) {
        node.scrollIntoView({ block: "center" });
        const r = node.getBoundingClientRect();
        Object.assign(box.style, {
          left: `${r.left + scrollX - 6}px`,
          top: `${r.top + scrollY - 6}px`,
          width: `${r.width + 12}px`,
          height: `${r.height + 12}px`,
        });
      }
      overlay.querySelector("[data-caption]").textContent =
        `🔊 ${step}. ${phrase}`;
    },
    [step, phrase],
  );
  await page.waitForTimeout(RECORD_STEP_MS);
}
