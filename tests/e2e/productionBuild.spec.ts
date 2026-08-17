import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * The released build, executed.
 *
 * Every other browser test in this suite drives the Vite dev server, so the one
 * artifact that actually reaches a player was the one artifact no gate had ever
 * run. A pruning mistake, a path that only resolves in development, or a
 * production-only code path could all ship with the whole suite green.
 *
 * It is served from a subdirectory on purpose. itch.io and GitHub Pages — the
 * two most likely homes for a browser JRPG — both serve from a subpath, and
 * that is where this failed: index.html returned 200 while its own script
 * returned 404, then, once that was fixed, every sprite still 404ed because the
 * loader was resolving against the domain root. Neither was visible from a
 * root-hosted build, and neither was visible from source.
 */

// ESM: no __dirname here.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(REPO_ROOT, "dist");
const PORT = 8121;
const SUBPATH = "game";

let server: ChildProcess | undefined;
let servedRoot: string | undefined;

test.beforeAll(() => {
  // Built by `npm run build`, which the release gates already run. Skipping
  // rather than building here keeps this test honest about what it checks: the
  // package as produced, not one produced specially for it.
  if (!existsSync(join(DIST, "index.html"))) return;
  servedRoot = mkdtempSync(join(tmpdir(), "yggdrasil-dist-"));
  cpSync(DIST, join(servedRoot, SUBPATH), { recursive: true });
  // Node's own static server: no dependency, and nothing that could rewrite a
  // path on the way out and mask the bug this is here to catch.
  server = spawn(process.execPath, [
    "-e",
    `const http=require("http"),fs=require("fs"),p=require("path");
     const root=process.argv[1];
     const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".mp3":"audio/mpeg",".ogg":"audio/ogg",".md":"text/markdown"};
     http.createServer((q,s)=>{
       let f=p.join(root,decodeURIComponent(q.url.split("?")[0]));
       if(f.endsWith(p.sep)||!p.extname(f))f=p.join(f,"index.html");
       fs.readFile(f,(e,d)=>{
         if(e){s.writeHead(404).end("not found");return;}
         s.writeHead(200,{"content-type":types[p.extname(f)]??"application/octet-stream"}).end(d);
       });
     }).listen(${PORT},"127.0.0.1");`,
    servedRoot
  ], { stdio: "ignore" });
});

test.afterAll(() => {
  server?.kill();
  if (servedRoot) rmSync(servedRoot, { recursive: true, force: true });
});

test("the released build runs, and fetches every file, from a subdirectory", async ({ page }) => {
  test.skip(!servedRoot, "no dist/ present; run npm run build first");

  const failures: string[] = [];
  const consoleErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => failures.push(`failed ${request.url()}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  // Give the static server a moment to bind before the first navigation.
  await expect.poll(async () => {
    try {
      const probe = await page.request.get(`http://127.0.0.1:${PORT}/${SUBPATH}/index.html`);
      return probe.status();
    } catch {
      return 0;
    }
  }, { timeout: 20_000 }).toBe(200);

  await page.goto(`http://127.0.0.1:${PORT}/${SUBPATH}/`);
  const app = page.locator("#app");
  await expect(app, "the title should draw from a subdirectory").toHaveAttribute("data-scene", "title", { timeout: 30_000 });

  // Playable, not merely drawn: character creation and into the world.
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(160);
  }
  await expect(app, "a chronicle should start from a subdirectory").toHaveAttribute("data-scene", "world", { timeout: 25_000 });

  // Let the world's own textures and its location score finish arriving, since
  // those are fetched after the scene appears.
  await page.waitForTimeout(2500);

  expect(failures, "every file the built game asks for must resolve").toEqual([]);
  expect(consoleErrors, "the built game must run without console errors").toEqual([]);

  // The developer hook is DEV-only, so its absence is part of what "this is the
  // production build" means.
  const devHook = await page.evaluate(() =>
    (window as unknown as { __YGG_GAME?: unknown }).__YGG_GAME !== undefined);
  expect(devHook, "the debug hook must not reach a production build").toBe(false);
});
