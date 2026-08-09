import { expect, test, type Page } from "@playwright/test";

/**
 * Every screen in the title scene marks its selection with something other
 * than colour.
 *
 * Colour alone is the one selection signal a player with a colour vision
 * deficiency cannot read. The title menu grew a gold highlight bar; the four
 * screens behind it — settings, key bindings, load and character creation —
 * kept a bare cursor glyph and a colour change, so the first screen felt built
 * and the rest felt like a list.
 *
 * The bar is a Container of Rectangles, which is what distinguishes it from the
 * Text rows around it, so counting containers is enough to prove it is there.
 */

/** How many highlight bars the title scene is currently drawing. */
function selectionBars(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = (window as unknown as {
      __YGG_GAME?: { scene: { getScene(key: string): { children: { list: unknown[] } } | undefined } };
    }).__YGG_GAME;
    const list = (game?.scene.getScene("title")?.children.list ?? []) as {
      type: string; visible: boolean; list?: unknown[];
    }[];
    return list.filter((child) =>
      child.type === "Container" && child.visible && (child.list?.length ?? 0) > 10).length;
  });
}

test("every title screen signals selection with more than colour", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-scene", "title");
  await page.waitForTimeout(900);

  expect(await selectionBars(page), "the title menu should highlight its selected row").toBe(1);

  // Load menu: two rows down, then confirm.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(180);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(180);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  expect(await selectionBars(page), "the load menu should highlight its selected slot").toBe(1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Settings, then key bindings from its last row.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(180);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  expect(await selectionBars(page), "the settings screen should highlight its selected row").toBe(1);

  for (let step = 0; step < 7; step += 1) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(130);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  expect(await selectionBars(page), "the bindings screen should highlight its selected action").toBe(1);

  // And it follows the cursor into the second column rather than staying put.
  for (let step = 0; step < 9; step += 1) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(120);
  }
  const columnBar = await page.evaluate(() => {
    const game = (window as unknown as {
      __YGG_GAME?: { scene: { getScene(key: string): { children: { list: unknown[] } } | undefined } };
    }).__YGG_GAME;
    const list = (game?.scene.getScene("title")?.children.list ?? []) as {
      type: string; visible: boolean; list?: { x: number }[];
    }[];
    const bar = list.find((child) =>
      child.type === "Container" && child.visible && (child.list?.length ?? 0) > 10);
    return Math.round(bar?.list?.[0]?.x ?? -1);
  });
  expect(columnBar, "the bar should move to the second column, not stay in the first")
    .toBeGreaterThan(300);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Character creation, from the top row of the title.
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(160);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  expect(await selectionBars(page), "character creation should highlight its selected row").toBe(1);
});
