import { expect, test, type Page } from "@playwright/test";

/**
 * The hero turns to face the way it walks.
 *
 * The sheet loaded for the avatar holds 192 frames — eight facings of six
 * four-frame cycles — and the game rendered frame 0 of it for the whole
 * campaign, so north, south, east and west all drew the same front-facing
 * picture.
 *
 * This is asserted here rather than left to the sprite audit, which cannot
 * catch it: that audit only rejects a texture resolving to `__BASE`, and a
 * spritesheet falls back to frame '0' instead. An off-by-one row would walk the
 * character around in the death pose with every existing test still green.
 */

const FACING_FRAMES = { down: 0, right: 48, up: 96, left: 144 } as const;

async function enterWorld(page: Page): Promise<void> {
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
}

function readAvatar(page: Page): Promise<{ frame: string; facing: string; frameTotal: number }> {
  return page.evaluate(() => {
    const game = (window as unknown as { __YGG_GAME?: {
      textures: { get: (key: string) => { frameTotal: number } };
      scene: { scenes: { scene: { key: string }; player?: { frame: { name: string } }; facing?: string }[] };
    } }).__YGG_GAME;
    const world = game?.scene.scenes.find((candidate) => candidate.scene.key === "world");
    return {
      frame: String(world?.player?.frame.name ?? ""),
      facing: String(world?.facing ?? ""),
      frameTotal: game?.textures.get("sprite.player").frameTotal ?? 0
    };
  });
}

test("the hero faces the direction it is walking", async ({ page }) => {
  await enterWorld(page);

  const initial = await readAvatar(page);
  // 192 cells plus __BASE. If the sheet ever loads as a plain image this drops
  // to 1, and the facing frames below would silently stop existing.
  expect(initial.frameTotal, "the avatar sheet must still be a spritesheet").toBe(193);

  for (const [direction, key] of [
    ["right", "ArrowRight"],
    ["down", "ArrowDown"],
    ["left", "ArrowLeft"],
    ["up", "ArrowUp"]
  ] as const) {
    await page.keyboard.press(key);
    // Comfortably past the 95ms step tween, which must stay the only thing
    // gating movement — the walk is not allowed to get slower than the input.
    await page.waitForTimeout(300);

    const avatar = await readAvatar(page);
    expect(avatar.facing, `pressing ${key} should face ${direction}`).toBe(direction);
    expect(
      avatar.frame,
      `facing ${direction} should render frame ${FACING_FRAMES[direction]}`
    ).toBe(String(FACING_FRAMES[direction]));
  }

  // Four distinct frames, so a table that collapsed to one value cannot pass.
  expect(new Set(Object.values(FACING_FRAMES)).size).toBe(4);
});
