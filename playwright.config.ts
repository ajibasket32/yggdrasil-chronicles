import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Phaser input and canvas screenshots are noticeably slower on shared Linux
  // runners than on a local desktop. This is a per-test ceiling, not a wait.
  timeout: 60_000,
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
