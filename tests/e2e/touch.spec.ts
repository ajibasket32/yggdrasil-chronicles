import { expect, test } from "@playwright/test";

// A real touch context: the pad only mounts when the device reports touch
// points, so a narrow desktop window would not exercise this.
test.use({ hasTouch: true, viewport: { width: 390, height: 780 } });

/**
 * The 720px breakpoint in styles.css promises a phone build. This walks that
 * build with taps only — no keyboard — to prove the promise is kept.
 */
test("a touch device can start and play a chronicle with taps alone", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(app).toHaveAttribute("data-touch-controls", "on");

  const confirm = page.locator(".touch-button.pad-a");
  const right = page.locator(".touch-button.pad-right");
  await expect(confirm).toBeVisible();

  // Character creation, then the prologue, entirely by tapping A.
  for (let tap = 0; tap < 6; tap += 1) {
    await confirm.tap();
    await page.waitForTimeout(160);
  }
  await expect(app).toHaveAttribute("data-scene", "world");
  for (let tap = 0; tap < 40; tap += 1) {
    if (await app.getAttribute("data-pending-scene") === "none") break;
    await confirm.tap();
    await page.waitForTimeout(150);
  }
  await expect(app).toHaveAttribute("data-pending-scene", "none");

  // The d-pad moves the party: clear the NPC lane, then walk east to the
  // Mossroad — the same route the keyboard walk takes.
  const up = page.locator(".touch-button.pad-up");
  for (let tap = 0; tap < 2; tap += 1) {
    await up.tap();
    await page.waitForTimeout(150);
  }
  for (let tap = 0; tap < 17; tap += 1) {
    await right.tap();
    await page.waitForTimeout(150);
  }
  await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
});
