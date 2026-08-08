import { expect, test, type Page } from "@playwright/test";

/**
 * A panel fades in when it opens, and never again while it is open.
 *
 * Every keystroke in a menu rebuilds the whole overlay from scratch, so a
 * reveal attached to "the overlay was built" fires on every cursor move: the
 * panel drops to fully transparent and fades back on each press. That is not
 * visible in a screenshot and no assertion in the suite could see it — the
 * panel is opaque again long before any check runs. Sampling alpha on every
 * animation frame, from inside the page, is what catches it.
 *
 * Measured before the fix, on a single ArrowDown: 1, 1, 1, 0, 0.56, 1.
 */

/** Records the world overlay's alpha on every animation frame, in-page. */
async function startSampling(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as unknown as {
      __alphaSamples: number[];
      __alphaFrame: number;
      __YGG_GAME?: { scene: { getScene(key: string): { overlay?: { alpha: number } } | undefined } };
    };
    scope.__alphaSamples = [];
    const world = scope.__YGG_GAME?.scene.getScene("world");
    const tick = (): void => {
      scope.__alphaSamples.push(world?.overlay ? Number(world.overlay.alpha.toFixed(2)) : -1);
      scope.__alphaFrame = requestAnimationFrame(tick);
    };
    tick();
  });
}

/** The frames recorded since the last call, then resets the buffer. */
async function drainSamples(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const scope = window as unknown as { __alphaSamples: number[] };
    const taken = scope.__alphaSamples.slice();
    scope.__alphaSamples = [];
    return taken;
  });
}

/** A reveal shows up as at least one frame strictly between transparent and opaque. */
function faded(samples: number[]): boolean {
  return samples.some((alpha) => alpha >= 0 && alpha < 1);
}

test("panels fade in when opened, and never flicker while being navigated", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-scene", "title");
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(140);
  }
  await expect(app).toHaveAttribute("data-scene", "world");
  for (let press = 0; press < 40; press += 1) {
    if (await app.getAttribute("data-pending-scene") === "none") break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(130);
  }
  await expect(app).toHaveAttribute("data-pending-scene", "none");
  await page.waitForTimeout(250);

  await startSampling(page);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  expect(faded(await drainSamples(page)), "the system menu should fade in when opened").toBe(true);

  // The reveal is spent. Navigating rebuilds the panel repeatedly and must not
  // spend it again.
  for (let move = 0; move < 4; move += 1) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(320);
    expect(
      faded(await drainSamples(page)),
      `cursor move ${move + 1} must not re-fade a panel that is already open`
    ).toBe(false);
  }

  // Closing re-arms it, so reopening fades again rather than snapping in.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  await drainSamples(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  expect(faded(await drainSamples(page)), "reopening should fade in again").toBe(true);

  // And switching to a different panel is an opening too.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  await drainSamples(page);
  await page.keyboard.press("j");
  await page.waitForTimeout(500);
  expect(faded(await drainSamples(page)), "a different panel should fade in on its own").toBe(true);

  await page.evaluate(() => {
    const scope = window as unknown as { __alphaFrame: number };
    cancelAnimationFrame(scope.__alphaFrame);
  });
});
