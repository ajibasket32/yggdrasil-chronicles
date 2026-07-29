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

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

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
