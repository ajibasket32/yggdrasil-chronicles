import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Phaser input and canvas screenshots are noticeably slower on shared Linux
  // runners than on a local desktop. This is a per-test ceiling, not a wait.
  timeout: 90_000,
  expect: {
    // Playwright's 5s default is a budget for a DOM that is already there. Here
    // every assertion waits on state that a Phaser scene has to boot, load and
    // render first, and on a loaded machine that legitimately takes longer —
    // two full-session walks failed a `toHaveAttribute` on runs that took twice
    // their usual wall-clock, then passed unchanged on the retry. Three call
    // sites had already been hand-patched to 15s by whoever hit it first; this
    // makes that the default instead of a thing each test rediscovers.
    //
    // It does not mask a broken game: an assertion that is genuinely wrong
    // still fails, just ten seconds later.
    timeout: 15_000
  },
  // One worker: every test drives the same Phaser canvas against one dev
  // server, and input timing is the thing being measured. Parallel workers
  // contend for that server and turn keypress pacing into a coin flip.
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev:game",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
