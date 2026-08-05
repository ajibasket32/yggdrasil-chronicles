import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Phaser input and canvas screenshots are noticeably slower on shared Linux
  // runners than on a local desktop. This is a per-test ceiling, not a wait.
  timeout: 60_000,
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
