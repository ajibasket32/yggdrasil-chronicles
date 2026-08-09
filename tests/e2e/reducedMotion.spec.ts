import { expect, test, type Page } from "@playwright/test";

/**
 * The game played through with Reduced Motion on.
 *
 * Every other browser test in this suite runs with motion enabled — the two
 * that touch the setting turn it on at the title and reload, or set it
 * explicitly to false — so until now nothing had ever entered the world or a
 * battle with it on. That is the one configuration where this project's
 * characteristic animation bug lives — it has shipped once already, leaving
 * every toast invisible rather than merely static.
 *
 * The unit tests hold the three helpers to their rule in isolation. This holds
 * the actual scenes to the outcome: nothing may be left transparent, and no
 * transition may fail to arrive. Confirmed to have teeth by mutation — code
 * that leaves a panel at alpha 0 under Reduced Motion fails this at the
 * journal, with "Expected: 1, Received: 0".
 */

const REDUCED_MOTION_SETTINGS = {
  version: 1,
  textSize: "medium",
  highContrast: false,
  reducedMotion: true,
  soundEnabled: false,
  soundVolume: 0.5,
  musicEnabled: false,
  musicVolume: 0.5
};

async function bootWithReducedMotion(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    // The narrative proxy is optional by design; playing without it is supported.
    if (message.type() === "error" && !message.location().url.includes("/api/")) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  await page.addInitScript((settings) => {
    window.localStorage.setItem("yggdrasil-chronicles.settings.v2", JSON.stringify(settings));
  }, REDUCED_MOTION_SETTINGS);
  await page.goto("/");
  return errors;
}

/** Every visible object in a scene that is not fully opaque. */
function transparentObjects(page: Page, sceneKey: string): Promise<string[]> {
  return page.evaluate((key: string) => {
    const game = (window as unknown as { __YGG_GAME?: {
      scene: { getScene(name: string): { children: { list: unknown[] } } | undefined };
    } }).__YGG_GAME;
    const scene = game?.scene.getScene(key);
    const list = (scene?.children.list ?? []) as {
      type: string; alpha: number; visible: boolean; text?: string;
    }[];
    return list
      .filter((child) => child.visible && child.alpha < 1)
      .map((child) => `${child.type}(alpha=${child.alpha})${child.text ? ` "${String(child.text).slice(0, 24)}"` : ""}`);
  }, sceneKey);
}

test("the game is playable, and nothing is invisible, with Reduced Motion on", async ({ page }) => {
  const errors = await bootWithReducedMotion(page);
  const app = page.locator("#app");

  await expect(app).toHaveAttribute("data-scene", "title");

  // Starting a chronicle crosses a scene transition. With motion off the fade
  // is skipped entirely rather than run at zero length, so arrival is the thing
  // being asserted: a fade to black that nothing clears is unescapable.
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(140);
  }
  await expect(app, "Reduced Motion must not strand the player leaving the title")
    .toHaveAttribute("data-scene", "world");
  for (let press = 0; press < 40; press += 1) {
    if (await app.getAttribute("data-pending-scene") === "none") break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(130);
  }
  await expect(app).toHaveAttribute("data-pending-scene", "none");
  await page.waitForTimeout(250);

  // Every overlay is built by the same reveal path, which drops alpha to zero
  // before tweening it back. With motion off it must not touch alpha at all.
  for (const [name, key] of [
    ["journal", "j"], ["party", "p"], ["map", "m"], ["system", "Escape"]
  ] as const) {
    await page.keyboard.press(key);
    await page.waitForTimeout(260);
    const overlayAlpha = await page.evaluate(() => {
      const game = (window as unknown as { __YGG_GAME?: {
        scene: { getScene(name: string): { overlay?: { alpha: number } } | undefined };
      } }).__YGG_GAME;
      return game?.scene.getScene("world")?.overlay?.alpha ?? -1;
    });
    expect(overlayAlpha, `the ${name} panel must be fully opaque with Reduced Motion on`).toBe(1);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(220);
  }

  expect(await transparentObjects(page, "world"), "nothing in the world may be left part-faded")
    .toEqual([]);

  // Into a fight and back out, which crosses two more transitions. Driven
  // through the bridge so a blocked walking lane cannot be mistaken for a
  // Reduced Motion failure.
  await page.evaluate(async () => {
    const game = (window as unknown as { __YGG_GAME?: {
      registry: { get(key: string): { startEncounter(id: string): Promise<void> } };
      scene: { getScene(name: string): { scene: { start(key: string): void } } };
    } }).__YGG_GAME;
    await game?.registry.get("yggdrasil.bridge").startEncounter("encounter.mossroad-foragers");
    game?.scene.getScene("world").scene.start("battle");
  });
  await expect(app, "Reduced Motion must not strand the player entering a battle")
    .toHaveAttribute("data-scene", "battle");
  await page.waitForTimeout(400);

  // The health bars are scaled from their previous reading. At zero duration
  // the end state has to be applied directly — a bar frozen at the old value
  // would be lying about the fight.
  const bars = await page.evaluate(() => {
    const game = (window as unknown as { __YGG_GAME?: {
      scene: { getScene(name: string): { children: { list: unknown[] } } | undefined };
    } }).__YGG_GAME;
    const list = (game?.scene.getScene("battle")?.children.list ?? []) as {
      type: string; scaleX: number; visible: boolean;
    }[];
    return list.filter((child) => child.type === "Rectangle" && child.visible)
      .map((child) => child.scaleX);
  });
  expect(bars.length, "the battle should have drawn some bars").toBeGreaterThan(0);
  expect(bars.every((scale) => Number.isFinite(scale)), "no bar may have a broken scale").toBe(true);

  expect(await transparentObjects(page, "battle"), "nothing in a battle may be left part-faded")
    .toEqual([]);

  // The day/night wash is a counter tween rather than a property tween, so it
  // has its own zero-duration path: it must land on the final alpha directly
  // instead of holding the old one.
  const tint = await page.evaluate(() => {
    const world = (window as unknown as { __YGG_GAME?: { scene: { getScene(key: string): {
      snapshot: { worldMinutes: number };
      applyDayTint(): void;
      dayTint?: { fillAlpha: number };
      tweens: { getTweens(): unknown[] };
    } | undefined } } }).__YGG_GAME?.scene.getScene("world");
    if (!world) return { alpha: -1, tweens: -1 };
    world.snapshot = { ...world.snapshot, worldMinutes: 22 * 60 };
    world.applyDayTint();
    return { alpha: world.dayTint?.fillAlpha ?? -1, tweens: world.tweens.getTweens().length };
  });
  expect(tint.alpha, "nightfall must be applied at full strength immediately").toBeGreaterThan(0.3);
  expect(tint.tweens, "and must not animate at all").toBe(0);

  // Leaving the battle is the transition that used to be a hard cut, and the
  // one place a fade-to-black could strand the player with no way back.
  for (let press = 0; press < 16; press += 1) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(900);
  await expect(app, "Reduced Motion must not strand the player leaving a battle")
    .toHaveAttribute("data-scene", "world");
  const restored = await page.evaluate(() => {
    const world = (window as unknown as { __YGG_GAME?: { scene: { getScene(key: string): {
      cameras?: { main?: { alpha: number; fadeEffect?: { isRunning: boolean } } };
    } | undefined } } }).__YGG_GAME?.scene.getScene("world");
    return {
      alpha: world?.cameras?.main?.alpha ?? -1,
      fading: Boolean(world?.cameras?.main?.fadeEffect?.isRunning)
    };
  });
  expect(restored.alpha, "the world must come back at full brightness").toBe(1);
  expect(restored.fading, "no fade may still be running after arrival").toBe(false);
  expect(await transparentObjects(page, "world"), "nothing may be left part-faded after a battle")
    .toEqual([]);

  expect(errors, "Reduced Motion must not produce console errors").toEqual([]);
});
