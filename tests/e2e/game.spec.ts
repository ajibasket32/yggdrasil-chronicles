import { expect, test, type Page } from "@playwright/test";

async function pressRepeatedly(
  page: Page,
  key: string,
  count: number
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press(key);
    await page.waitForTimeout(115);
  }
}

test("new chronicle reaches exploration and deterministic battle", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-scene", "title");

  await pressRepeatedly(page, "Enter", 5);

  await expect(canvas).toBeVisible();
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-location-id", "location.hearthcross");
  await expect(app).toHaveAttribute("data-scene", "world");

  // Leave the town's central NPC lane before walking to the east road.
  await pressRepeatedly(page, "ArrowUp", 2);
  await pressRepeatedly(page, "ArrowRight", 17);
  await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
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
  await pressRepeatedly(page, "Enter", 5);
  await expect(page.locator("#app")).toHaveAttribute("data-scene", "world");

  const world = await canvas.screenshot();
  await page.keyboard.press("Escape");
  const system = await canvas.screenshot();
  expect(system.equals(world)).toBe(false);

  // Save slot 3 is reachable with the same directional controls as the rest
  // of the game, then the last command returns to the title scene.
  await pressRepeatedly(page, "ArrowDown", 2);
  await page.keyboard.press("Enter");
  await pressRepeatedly(page, "ArrowDown", 2);
  await page.keyboard.press("Enter");
  await expect(page.locator("#app")).toHaveAttribute("data-scene", "title");
});

test("manual load restores the selected chronicle from the title", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(app).toHaveAttribute("data-scene", "title");
  await pressRepeatedly(page, "Enter", 5);
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
  await pressRepeatedly(page, "ArrowDown", 4);
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-scene", "title");
  await pressRepeatedly(page, "ArrowDown", 2);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await expect(app).toHaveAttribute("data-scene", "world");
  await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
});

test("inventory targets a party member and visibly consumes a restorative", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(app).toHaveAttribute("data-scene", "title");
  await pressRepeatedly(page, "Enter", 5);
  await expect(app).toHaveAttribute("data-scene", "world");

  // Take one hit so the selected restorative has a meaningful target.
  await pressRepeatedly(page, "ArrowUp", 2);
  await pressRepeatedly(page, "ArrowRight", 17);
  await page.keyboard.press("b");
  await expect(app).toHaveAttribute("data-scene", "battle");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-battle-state", "escaped");
  await page.keyboard.press("Enter");
  await expect(app).toHaveAttribute("data-scene", "world");

  await page.keyboard.press("i");
  const selectedItem = await canvas.screenshot();
  await page.keyboard.press("Enter");
  const targetChoice = await canvas.screenshot();
  expect(targetChoice.equals(selectedItem)).toBe(false);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  const usedItem = await canvas.screenshot();
  expect(usedItem.equals(selectedItem)).toBe(false);
});
