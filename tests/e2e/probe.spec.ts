import { expect, test, type Page } from "@playwright/test";
test.skip(process.env.PLAYTEST !== "1", "probe");
test.setTimeout(300_000);

async function pressRepeatedly(page: Page, key: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) { await page.keyboard.press(key); await page.waitForTimeout(140); }
}
async function grid(page: Page): Promise<{ x: number; y: number } | undefined> {
  return page.evaluate(() => {
    const game = (window as unknown as { __YGG_GAME?: { scene: { getScene(key: string): unknown } } }).__YGG_GAME;
    const world = game?.scene.getScene("world") as { playerGrid?: { x: number; y: number } } | undefined;
    return world?.playerGrid;
  });
}

test("probe crossTo east after battle", async ({ page }) => {
  await page.goto("/");
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-scene", "title");
  await pressRepeatedly(page, "Enter", 6);
  await expect(app).toHaveAttribute("data-scene", "world");
  for (let press = 0; press < 40; press += 1) {
    if (await app.getAttribute("data-pending-scene") === "none") break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(140);
  }
  await pressRepeatedly(page, "ArrowUp", 2);
  await pressRepeatedly(page, "ArrowRight", 17);
  await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
  await pressRepeatedly(page, "ArrowRight", 13);
  await page.keyboard.press("b");
  await expect(app).toHaveAttribute("data-scene", "battle");
  for (let round = 0; round < 30; round += 1) {
    const state = await app.getAttribute("data-battle-state");
    if (state === "victory" || state === "defeat" || state === "escaped") break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  console.log("POST-B:", JSON.stringify(await grid(page)));
  for (let step = 0; step < 16; step += 1) {
    const location = await app.getAttribute("data-location-id");
    if (location === "location.emberwake") { console.log("CROSSED at step", step); break; }
    const at = await grid(page);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(160);
    const after = await grid(page);
    console.log("STEP", step, JSON.stringify(at), "->", JSON.stringify(after), location);
    if (at && after && at.x === after.x && at.y === after.y && location !== "location.emberwake") {
      await page.keyboard.press(step % 2 === 0 ? "ArrowDown" : "ArrowUp");
      await page.waitForTimeout(150);
      console.log("JIGGLE ->", JSON.stringify(await grid(page)));
    }
  }
  console.log("FINAL:", await app.getAttribute("data-location-id"), JSON.stringify(await grid(page)));
});
