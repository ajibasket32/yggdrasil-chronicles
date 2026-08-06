import { expect, test, type Page } from "@playwright/test";

/**
 * Second review session: the mid-game. Walks to Emberwake, learns and uses
 * trail remedies, and looks at the second region with the same screenshot-
 * per-beat discipline as playtest.spec.ts. PLAYTEST=1, outside the gates.
 */
test.describe("@playtest", () => {
  test.skip(process.env.PLAYTEST !== "1", "on-demand playtest, set PLAYTEST=1");
  test.setTimeout(600_000);

  async function pressRepeatedly(page: Page, key: string, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await page.keyboard.press(key);
      await page.waitForTimeout(140);
    }
  }

  async function shot(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(250);
    await page.locator("canvas").screenshot({ path: `test-results/play2/${name}.png` });
  }

  async function clearScene(page: Page): Promise<void> {
    const app = page.locator("#app");
    for (let press = 0; press < 40; press += 1) {
      if (await app.getAttribute("data-pending-scene") === "none") break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(140);
    }
  }

  test("mid-game: Emberwake, the ledger, and the second region", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !message.location().url.includes("/api/")) {
        errors.push(`${message.text()} (${message.location().url})`);
      }
    });
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto("/");
    const app = page.locator("#app");
    await expect(page.locator("canvas")).toBeVisible();
    await expect(app).toHaveAttribute("data-scene", "title");
    await pressRepeatedly(page, "Enter", 6);
    await expect(app).toHaveAttribute("data-scene", "world");
    await clearScene(page);

    // The remedies row before the unlock: a promise, not a menu.
    await page.keyboard.press("Escape");
    await pressRepeatedly(page, "ArrowDown", 7);
    await shot(page, "01-remedies-locked-row");
    await page.keyboard.press("Enter");
    await shot(page, "02-remedies-locked-toast");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // East to the Mossroad, then east again to Emberwake.
    await pressRepeatedly(page, "ArrowUp", 2);
    await pressRepeatedly(page, "ArrowRight", 17);
    await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
    await pressRepeatedly(page, "ArrowRight", 22);
    await expect(app).toHaveAttribute("data-location-id", "location.emberwake");
    await shot(page, "03-emberwake-arrival-scene");
    await clearScene(page);
    await shot(page, "04-emberwake-town");

    // The chronicle recorded the teaching; the ledger now opens.
    await page.keyboard.press("Escape");
    await pressRepeatedly(page, "ArrowDown", 7);
    await shot(page, "05-remedies-row-unlocked");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await shot(page, "06-remedies-ledger");

    // Steep a Root Tonic: the starting pack carries three vesleaf.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await shot(page, "07-remedies-after-craft");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // The party screen states the ancestry trait.
    await page.keyboard.press("p");
    await shot(page, "08-party-trait-line");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Walk back west and look at the Mossroad again on the way out.
    await pressRepeatedly(page, "ArrowLeft", 22);
    await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
    await shot(page, "09-mossroad-return");

    if (errors.length > 0) console.log("CONSOLE ERRORS:\n" + errors.join("\n"));
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
