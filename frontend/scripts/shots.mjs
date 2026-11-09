// Screenshots the main pages as phones see them, light and dark, through the installed Chrome, and
// names any element that runs past the screen's edge. `just shots [path…]`, SHOTS_LANG=de for German;
// the dev server must be up.
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.SHOTS_URL ?? "http://localhost:5173";
const OUT = fileURLToPath(new URL("../shots/", import.meta.url));
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The app's language (bj.lang): German and French labels run longest.
const LANG = process.env.SHOTS_LANG ?? "en";
const WIDTHS = [320, 375];
const THEMES = ["light", "dark"];
const HEIGHT = 812;
// Long pages are cut here: the top is what a review needs, and the files stay readable.
const MAX_HEIGHT = 2400;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The pages to shoot: the ones asked for, else the main ones with a sample jam and dancer. */
async function pages() {
  const asked = process.argv.slice(2);
  if (asked.length) return asked;
  const first = (path) =>
    fetch(BASE + path)
      .then((r) => r.json())
      .then((list) => list.items?.[0])
      .catch(() => undefined);
  const [jam, dancer] = await Promise.all([
    first("/api/events?limit=1"),
    first("/api/dancers?limit=1"),
  ]);
  return [
    "/",
    "/jams",
    "/map",
    "/dancers",
    "/search?q=paris",
    jam && `/jams/${jam.slug}`,
    dancer && `/dancers/${dancer.id}`,
  ].filter(Boolean);
}

/** Starts a headless Chrome on a free port and connects to its first tab. */
async function connect(profile) {
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ]);
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await wait(100);
    try {
      port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(
        "\n",
      )[0];
    } catch {
      // Chrome writes it once it listens.
    }
  }
  if (!port) throw new Error(`Chrome did not start: is it at ${CHROME}?`);
  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) =>
    r.json(),
  );
  const ws = new WebSocket(
    tabs.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, (m) =>
        m.error ? reject(new Error(m.error.message)) : resolve(m.result),
      );
      ws.send(JSON.stringify({ id, method, params }));
    });
  const exited = new Promise((resolve) => chrome.on("exit", resolve));
  // Chrome writes its profile until it exits: wait before removing it.
  const close = () => (ws.close(), chrome.kill(), exited);
  return { send, close };
}

// Runs in the page: elements whose right edge passes the screen's, outside the strips meant to scroll.
// The screen's width is passed in: a page that overflows widens innerWidth on a phone.
const overflowOf = (width) => `(() => {
  const scrolls = (el) => ["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(el).overflowX);
  const inStrip = (el) => { for (let p = el.parentElement; p; p = p.parentElement) if (scrolls(p)) return true; return false; };
  const name = (el) => el.tagName.toLowerCase() + (el.getAttribute("aria-label") ? '[' + el.getAttribute("aria-label") + ']' : "") + (el.textContent.trim() ? ' "' + el.textContent.trim().slice(0, 30) + '"' : "");
  const out = [...document.body.querySelectorAll("*")].filter((el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.right > ${width} + 1 && !inStrip(el);
  });
  // Only the outermost: its children overflow with it.
  return out.filter((el) => !out.includes(el.parentElement)).slice(0, 5).map(name);
})()`;

/** Loads `path` at `width` in `theme`, saves its screenshot and returns what overflows. */
async function shoot(send, path, { width, theme }) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: theme }],
  });
  await send("Page.navigate", { url: BASE + path });
  // The page asks the API after it loads; fonts and images follow.
  await wait(2000);
  const { result } = await send("Runtime.evaluate", {
    expression: `document.fonts.ready.then(() => [document.documentElement.scrollHeight, ${overflowOf(width)}])`,
    awaitPromise: true,
    returnByValue: true,
  });
  const [height, overflow] = result.value;
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height: Math.min(height, MAX_HEIGHT), scale: 1 },
  });
  const slug =
    path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "landing";
  const file = join(OUT, `${slug}-${LANG}-${width}-${theme}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  return { file, overflow };
}

// Chrome would screenshot its own "can't be reached" page and find nothing past the edge.
const up = await fetch(BASE).then(
  (r) => r.ok,
  () => false,
);
if (!up) {
  console.error(
    `${BASE} doesn't answer: start it with \`just dev\` (or \`just frontend\`).`,
  );
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), "shots-"));
mkdirSync(OUT, { recursive: true });
const { send, close } = await connect(profile);
let problems = 0;
try {
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  // The language is the site's to remember: store it once, every page then opens in it.
  await send("Page.navigate", { url: BASE });
  await wait(500);
  await send("Runtime.evaluate", {
    expression: `localStorage.setItem("bj.lang", ${JSON.stringify(LANG)})`,
  });
  for (const path of await pages()) {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        const { file, overflow } = await shoot(send, path, { width, theme });
        console.log(overflow.length ? `✗ ${file}` : `✓ ${file}`);
        for (const element of overflow)
          console.log(`    past the edge: ${element}`);
        problems += overflow.length ? 1 : 0;
      }
    }
  }
} finally {
  await close();
  rmSync(profile, { recursive: true, force: true });
}
if (problems) {
  console.log(
    `${problems} screenshot(s) with something past the screen's edge.`,
  );
  process.exit(1);
}
