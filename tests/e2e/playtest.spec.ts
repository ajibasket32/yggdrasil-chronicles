import { expect, test, type Page } from "@playwright/test";

/**
 * A scripted play session, not an assertion suite: walks the game the way a
 * first-time player would and drops a screenshot at every beat into
 * test-results/play/ for human (or model) review. Run on demand with
 *   npx playwright test playtest --grep @playtest
 * It is tagged out of the default run because it is slow and its output is
 * pictures, not pass/fail.
 */
test.describe("@playtest", () => {
  // Screenshot review session, not a gate: run with PLAYTEST=1.
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
    await page.locator("canvas").screenshot({ path: `test-results/play/${name}.png` });
  }

  async function talkUntilClosed(page: Page): Promise<void> {
    const app = page.locator("#app");
    await page.keyboard.press("e");
    await page.waitForTimeout(300);
    for (let press = 0; press < 40; press += 1) {
      if (await app.getAttribute("data-dialogue") === "none") break;
      await page.keyboard.press("e");
      await page.waitForTimeout(140);
    }
  }

  test("full first-session walkthrough with screenshots", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      // The narrative proxy is optional by design; playing without the AI
      // server is a supported mode, so its failed requests are not findings.
      if (message.type() === "error" && !message.location().url.includes("/api/")) {
        errors.push(`${message.text()} (${message.location().url})`);
      }
    });
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto("/");
    const app = page.locator("#app");
    await expect(page.locator("canvas")).toBeVisible();
    await expect(app).toHaveAttribute("data-scene", "title");
    await shot(page, "01-title");

    // Settings screen, then back.
    await pressRepeatedly(page, "ArrowDown", 3);
    await page.keyboard.press("Enter");
    await shot(page, "02-settings");
    await page.keyboard.press("Escape");
    await pressRepeatedly(page, "ArrowUp", 3);

    // Character creation, pausing on each row.
    await page.keyboard.press("Enter");
    await shot(page, "03-creation-name");
    await page.keyboard.press("Enter");
    await shot(page, "04-creation-ancestry");
    await page.keyboard.press("ArrowRight");
    await shot(page, "05-creation-ancestry-sylvan");
    await page.keyboard.press("Enter");
    await shot(page, "06-creation-job");
    await page.keyboard.press("ArrowRight");
    await shot(page, "07-creation-job-second");
    await page.keyboard.press("Enter");
    await shot(page, "08-creation-difficulty");
    await page.keyboard.press("Enter");
    await shot(page, "09-creation-confirm");
    await page.keyboard.press("Enter");
    await expect(app).toHaveAttribute("data-scene", "world");

    // Prologue.
    await shot(page, "10-prologue-first-line");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await shot(page, "11-prologue-mid");
    for (let press = 0; press < 40; press += 1) {
      if (await app.getAttribute("data-pending-scene") === "none") break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(140);
    }
    await shot(page, "12-town-after-prologue");

    // Talk to Mara (quest step 1).
    await pressRepeatedly(page, "ArrowRight", 2);
    await shot(page, "13-near-mara-prompt");
    await page.keyboard.press("e");
    await page.waitForTimeout(500);
    await shot(page, "14-mara-dialogue-revealing");
    await page.keyboard.press("e");
    await page.waitForTimeout(300);
    await shot(page, "15-mara-dialogue-complete-line");
    for (let press = 0; press < 40; press += 1) {
      if (await app.getAttribute("data-dialogue") === "none") break;
      await page.keyboard.press("e");
      await page.waitForTimeout(140);
    }

    // Journal, map, codex, party, inventory, system menu.
    await page.keyboard.press("j");
    await shot(page, "16-journal");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.keyboard.press("m");
    await shot(page, "17-map");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.keyboard.press("h");
    await shot(page, "18-codex");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.keyboard.press("p");
    await shot(page, "19-party");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.keyboard.press("i");
    await shot(page, "20-inventory");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
    await shot(page, "21-system-menu");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Finish The First Silence with Orren.
    await pressRepeatedly(page, "ArrowDown", 3);
    await talkUntilClosed(page);
    await shot(page, "22-after-first-quest");
    await page.keyboard.press("j");
    await shot(page, "23-journal-after-quest");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // East to the Mossroad and into a battle. After Orren (three rows below
    // Mara's lane) the party climbs back to the lane the encounter walk uses.
    await pressRepeatedly(page, "ArrowUp", 5);
    await pressRepeatedly(page, "ArrowRight", 17);
    await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
    await shot(page, "24-mossroad");
    // Two of the town presses crossed into the road, so eleven more reach the
    // foe at (14,8) from here.
    await pressRepeatedly(page, "ArrowRight", 11);
    await shot(page, "25-near-encounter");
    await page.keyboard.press("b");
    await expect(app).toHaveAttribute("data-scene", "battle");
    await shot(page, "26-battle-start");

    // Look at the skill menu and target selection.
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await shot(page, "27-battle-skill-menu");
    await page.keyboard.press("Enter");
    await shot(page, "28-battle-target-or-cast");
    await page.waitForTimeout(600);
    await shot(page, "29-battle-after-first-action");

    // Fight to the end with plain attacks.
    for (let round = 0; round < 30; round += 1) {
      const state = await app.getAttribute("data-battle-state");
      if (state === "victory" || state === "defeat" || state === "escaped") break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
    }
    await shot(page, "30-battle-end");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await expect(app).toHaveAttribute("data-scene", "world");
    await shot(page, "31-back-on-road");

    // Viewport resize mid-session: the canvas must follow the window.
    await page.setViewportSize({ width: 900, height: 620 });
    await page.waitForTimeout(400);
    await shot(page, "32-resized-window");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(400);

    // Back to town; find the vendor (Joryn, the innkeeper) and open the shop.
    await pressRepeatedly(page, "ArrowLeft", 14);
    await expect(app).toHaveAttribute("data-location-id", "location.hearthcross");
    await shot(page, "33-town-return");

    // Joryn keeps the inn and the shop: seven tiles east, five south.
    await pressRepeatedly(page, "ArrowRight", 7);
    await pressRepeatedly(page, "ArrowDown", 5);
    await page.keyboard.press("e");
    await page.waitForTimeout(400);
    await shot(page, "34-joryn-dialogue");
    for (let press = 0; press < 40; press += 1) {
      if (await app.getAttribute("data-dialogue") === "none") break;
      await page.keyboard.press("e");
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(400);
    await shot(page, "35-shop");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Park the chronicle in Manual Slot 1, then read it back from the title.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await shot(page, "36-after-manual-save");
    await pressRepeatedly(page, "ArrowDown", 14);
    await page.keyboard.press("Enter");
    await expect(app).toHaveAttribute("data-scene", "title");
    await pressRepeatedly(page, "ArrowDown", 2);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await shot(page, "37-load-menu");

    if (errors.length > 0) {
      console.log("CONSOLE ERRORS DURING PLAY:\n" + errors.join("\n"));
    }
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
