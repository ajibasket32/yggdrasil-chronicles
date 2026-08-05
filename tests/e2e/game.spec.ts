import { expect, test, type Page } from "@playwright/test";

async function pressRepeatedly(
  page: Page,
  key: string,
  count: number
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press(key);
    await page.waitForTimeout(140);
  }
}

/**
 * Walks the title screen into a playable world: six confirms through character
 * creation, then past the prologue. The prologue is a scripted scene that owns
 * input until it finishes, so every walk has to clear it before it can move.
 */
async function startNewChronicle(page: Page): Promise<void> {
  await pressRepeatedly(page, "Enter", 6);
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-scene", "world");
  // Clear the prologue by watching the DOM rather than counting keys: the
  // typewriter reveal means a line can take two confirms (finish, then
  // advance), and authored line counts must stay free to change.
  for (let press = 0; press < 40; press += 1) {
    if (await app.getAttribute("data-pending-scene") === "none") break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(130);
  }
  await expect(app).toHaveAttribute("data-pending-scene", "none");
  await page.waitForTimeout(150);
}

/**
 * Holds a full conversation with whoever the party is standing next to, then
 * leaves it closed. Counting keypresses does not work any more: the typewriter
 * reveal makes a line cost one confirm or two depending on how long it is, and
 * an extra confirm after the last line simply reopens the conversation, which
 * silently blocks every movement key that follows.
 */
async function speakWithNearbyNpc(page: Page): Promise<void> {
  const app = page.locator("#app");
  await page.keyboard.press("e");
  await expect(app).toHaveAttribute("data-dialogue", "open");
  for (let press = 0; press < 40; press += 1) {
    if (await app.getAttribute("data-dialogue") === "none") break;
    await page.keyboard.press("e");
    await page.waitForTimeout(130);
  }
  await expect(app).toHaveAttribute("data-dialogue", "none");
}

test("new chronicle reaches exploration and deterministic battle", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-scene", "title");

  await startNewChronicle(page);

  await expect(canvas).toBeVisible();
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-location-id", "location.hearthcross");
  await expect(app).toHaveAttribute("data-scene", "world");

  // Leave the town's central NPC lane before walking to the east road.
  await pressRepeatedly(page, "ArrowUp", 2);
  await pressRepeatedly(page, "ArrowRight", 17);
  await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
  // The encounter key now engages only a nearby foe; walk to the visible
  // encounter at (14,8) — arrival from the west edge lands at (1,7).
  await pressRepeatedly(page, "ArrowRight", 13);
  const road = await canvas.screenshot();
  await page.keyboard.press("b");
  await expect(app).toHaveAttribute("data-battle-state", "choosing");
  await expect(app).toHaveAttribute("data-scene", "battle");
  const battle = await canvas.screenshot();

  expect(battle.equals(road)).toBe(false);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  await expect(canvas).toBeVisible();
});

test("core game starts with the narrative proxy unavailable", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});

test("system menu exposes all manual save slots and can return to the title", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-scene", "title");
  await startNewChronicle(page);
  await expect(page.locator("#app")).toHaveAttribute("data-scene", "world");

  const world = await canvas.screenshot();
  await page.keyboard.press("Escape");
  const system = await canvas.screenshot();
  expect(system.equals(world)).toBe(false);

  // Save slot 3 is reachable with the same directional controls as the rest
  // of the game, then the last command returns to the title scene.
  //
  // These counts track SYSTEM_MENU_COMMAND_COUNT in WorldScene: "Return to
  // Title" is the final row, so adding a command shifts every walk that ends
  // there. Update both walks in this file together.
  await pressRepeatedly(page, "ArrowDown", 2);
  await page.keyboard.press("Enter");
  await pressRepeatedly(page, "ArrowDown", 12);
  await page.keyboard.press("Enter");
  await expect(page.locator("#app")).toHaveAttribute("data-scene", "title");
});

test("manual load restores the selected chronicle from the title", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(app).toHaveAttribute("data-scene", "title");
  await startNewChronicle(page);
  await expect(app).toHaveAttribute("data-scene", "world");

  // Mossroad is the identifiable state captured in Manual Slot 1.
  await pressRepeatedly(page, "ArrowUp", 2);
  await pressRepeatedly(page, "ArrowRight", 17);
  await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");

  // Change the autosaved session after the manual record exists.
  await page.keyboard.press("Escape");
  await pressRepeatedly(page, "ArrowLeft", 5);
  await expect(app).toHaveAttribute("data-location-id", "location.hearthcross");

  // Return to the title through the system menu, then load Manual Slot 1.
  await page.keyboard.press("Escape");
  await pressRepeatedly(page, "ArrowDown", 14);
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-scene", "title");
  await pressRepeatedly(page, "ArrowDown", 2);
  await page.keyboard.press("Enter");
  // Phaser redraws the title into the load sub-menu on the next render tick.
  // Keep the load confirmation separate so a slower CI renderer cannot drop it.
  await page.waitForTimeout(400);
  // The load menu opens on the quick-save slot, so step down to Manual Slot 1.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");

  await expect(app).toHaveAttribute("data-scene", "world", { timeout: 15_000 });
  await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
});

test("inventory targets a party member and visibly consumes a restorative", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(app).toHaveAttribute("data-scene", "title");
  await startNewChronicle(page);
  await expect(app).toHaveAttribute("data-scene", "world");

  // Take one hit so the selected restorative has a meaningful target.
  await pressRepeatedly(page, "ArrowUp", 2);
  await pressRepeatedly(page, "ArrowRight", 17);
  await pressRepeatedly(page, "ArrowRight", 13);
  await page.keyboard.press("b");
  await expect(app).toHaveAttribute("data-scene", "battle");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-battle-state", "escaped");
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-scene", "world");

  const quantityBeforeUse = Number(await app.getAttribute("data-inventory-total-quantity"));
  const hpBeforeUse = Number(await app.getAttribute("data-party-current-hp"));
  await page.keyboard.press("i");
  await page.keyboard.press("Enter");
  // Selecting an item rebuilds the inventory panel into its party-target view.
  await page.waitForTimeout(350);
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => Number(await app.getAttribute("data-inventory-total-quantity")))
    .toBe(quantityBeforeUse - 1);
  await expect
    .poll(async () => Number(await app.getAttribute("data-party-current-hp")))
    .toBeGreaterThan(hpBeforeUse);
});

test("system menu exports the autosave as a named JSON download", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(app).toHaveAttribute("data-scene", "title");
  await startNewChronicle(page);
  await expect(app).toHaveAttribute("data-scene", "world");

  // "Export a Save…" opens a slot picker rather than assuming the autosave;
  // the autosave is the first occupied slot, so it is already selected.
  await page.keyboard.press("Escape");
  await pressRepeatedly(page, "ArrowDown", 3);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("yggdrasil-chronicles-save.json");
});

test("accessibility and audio settings persist after a reload", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  const root = page.locator("html");
  const status = page.locator("#game-status");
  await expect(app).toHaveAttribute("data-scene", "title");
  await expect(status).toContainText("Title screen");

  await pressRepeatedly(page, "ArrowDown", 3);
  await page.keyboard.press("Enter");
  await expect(status).toContainText("Settings");
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-game-high-contrast", "true");
  await expect(status).toContainText("HIGH CONTRAST       ON");
  // Each toggle rebuilds the Phaser settings panel and its input bindings.
  // Cross that redraw boundary before moving to the next setting.
  await page.waitForTimeout(350);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(350);
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-game-text-size", "large");
  await page.waitForTimeout(350);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(350);
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-game-reduced-motion", "true");

  await page.reload();
  await expect(app).toHaveAttribute("data-scene", "title");
  await expect(root).toHaveAttribute("data-game-high-contrast", "true");
  await expect(root).toHaveAttribute("data-game-text-size", "large");
  await expect(root).toHaveAttribute("data-game-reduced-motion", "true");
});

test("a rebound journal key persists and controls the world scene", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  const canvas = page.locator("canvas");
  await expect(app).toHaveAttribute("data-scene", "title");

  // Settings -> Keyboard Bindings -> Journal, then capture K.
  await pressRepeatedly(page, "ArrowDown", 3);
  await page.keyboard.press("Enter");
  await pressRepeatedly(page, "ArrowDown", 5);
  await page.keyboard.press("Enter");
  await pressRepeatedly(page, "ArrowDown", 7);
  await page.keyboard.press("Enter");
  await page.keyboard.press("k");

  const savedSettings = await page.evaluate(() =>
    window.localStorage.getItem("yggdrasil-chronicles.settings.v2")
  );
  expect(savedSettings).toContain('"journal":["KeyK"]');

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await pressRepeatedly(page, "ArrowUp", 3);
  await startNewChronicle(page);
  await expect(app).toHaveAttribute("data-scene", "world");

  const world = await canvas.screenshot();
  await page.keyboard.press("k");
  const journal = await canvas.screenshot();
  expect(journal.equals(world)).toBe(false);

  await page.reload();
  expect(await page.evaluate(() =>
    window.localStorage.getItem("yggdrasil-chronicles.settings.v2")
  )).toContain('"journal":["KeyK"]');
});

test("an authored quest permanently updates world reputation and the journal", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(app).toHaveAttribute("data-scene", "title");
  await startNewChronicle(page);
  await expect(app).toHaveAttribute("data-scene", "world");
  await expect(app).toHaveAttribute("data-faction-standing-count", "0");

  // Speak with Mara and Orren to resolve The First Silence.
  await pressRepeatedly(page, "ArrowRight", 2);
  await speakWithNearbyNpc(page);
  await pressRepeatedly(page, "ArrowDown", 3);
  await speakWithNearbyNpc(page);

  await expect
    .poll(async () => await app.getAttribute("data-faction-standing-count"), { timeout: 15_000 })
    .toBe("2");
  await expect(app).toHaveAttribute("data-relationship-count", "2");
  const world = await canvas.screenshot();
  await page.keyboard.press("j");
  const journal = await canvas.screenshot();
  expect(journal.equals(world)).toBe(false);
});
