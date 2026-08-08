import { expect, test, type Page } from "@playwright/test";

/**
 * Every animation the game is supposed to play, proved to actually play.
 *
 * Animation fails silently. A tween that stops being created looks exactly like
 * one that finished early, screenshots cannot see the difference, and sampling
 * a property per frame is unreliable — under load the browser rendered as few
 * as four frames a second here, which is coarse enough to miss a 140ms slide
 * entirely and read it as a snap.
 *
 * So this records tween *creation* instead, which is load-independent: it wraps
 * the scene's tween manager and asks what was asked for. Each expectation below
 * is a specific piece of feedback a player would lose if it disappeared.
 */

/** Wraps a scene's tween manager so every tween it is asked for is recorded. */
async function recordAnimations(page: Page, sceneKey: string): Promise<void> {
  await page.evaluate((key: string) => {
    const scope = window as unknown as {
      __animations?: string[];
      __YGG_GAME?: { scene: { getScene(name: string): Record<string, unknown> | undefined } };
    };
    scope.__animations = scope.__animations ?? [];
    const scene = scope.__YGG_GAME?.scene.getScene(key) as {
      __recorded?: boolean;
      tweens: {
        add: (config: Record<string, unknown>) => unknown;
        addCounter: (config: Record<string, unknown>) => unknown;
      };
    } | undefined;
    // Phaser rebuilds a scene's tween manager when the scene restarts, so the
    // wrapper has to be reapplied rather than installed once at boot.
    if (!scene || scene.__recorded) return;
    scene.__recorded = true;

    const add = scene.tweens.add.bind(scene.tweens);
    scene.tweens.add = (config: Record<string, unknown>) => {
      const targets = config.targets as { type?: string } | { type?: string }[] | undefined;
      const target = Array.isArray(targets) ? targets[0] : targets;
      const properties = Object.keys(config).filter((name) => ![
        "targets", "duration", "ease", "delay", "onComplete", "onUpdate", "repeat", "yoyo"
      ].includes(name));
      scope.__animations?.push(`${key}:${target?.type ?? "object"}:${properties.sort().join(",")}`);
      return add(config);
    };
    const addCounter = scene.tweens.addCounter.bind(scene.tweens);
    scene.tweens.addCounter = (config: Record<string, unknown>) => {
      scope.__animations?.push(`${key}:counter`);
      return addCounter(config);
    };
  }, sceneKey);
}

async function takeAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scope = window as unknown as { __animations?: string[] };
    const taken = scope.__animations ?? [];
    scope.__animations = [];
    return taken;
  });
}

async function enterWorld(page: Page): Promise<void> {
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-scene", "title");
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  }
  await expect(app).toHaveAttribute("data-scene", "world");
  for (let press = 0; press < 40; press += 1) {
    if (await app.getAttribute("data-pending-scene") === "none") break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(130);
  }
  await expect(app).toHaveAttribute("data-pending-scene", "none");
  await page.waitForTimeout(300);
}

test("every animation the game promises is still being played", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(3000);

  // The title's drifting motes are created once, during create().
  const motes = await page.evaluate(() => {
    const scope = window as unknown as {
      __YGG_GAME?: { scene: { getScene(name: string): { tweens: { getTweens(): unknown[] } } | undefined } };
    };
    return scope.__YGG_GAME?.scene.getScene("title")?.tweens.getTweens().length ?? 0;
  });
  expect(motes, "the title's drifting motes should be running").toBeGreaterThan(4);

  await recordAnimations(page, "title");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(320);
  const onTitleMove = await takeAnimations(page);
  expect(onTitleMove.join(" "), "the selection highlight should travel between rows")
    .toContain("title:Container:y");

  // Back to NEW CHRONICLE: the check above left the cursor a row down, and
  // starting from CONTINUE with no autosave goes nowhere.
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  await enterWorld(page);
  await recordAnimations(page, "world");
  await takeAnimations(page);

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(320);
  expect((await takeAnimations(page)).join(" "), "the party should glide between tiles")
    .toContain("world:Image:x,y");

  await page.keyboard.press("p");
  await page.waitForTimeout(340);
  expect((await takeAnimations(page)).join(" "), "a panel should fade in when it opens")
    .toContain("world:Container:alpha");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // The day/night wash only moves when the hour crosses a threshold, so the
  // clock is moved to night rather than waiting for one.
  await takeAnimations(page);
  await page.evaluate(() => {
    const world = (window as unknown as {
      __YGG_GAME?: { scene: { getScene(name: string): {
        snapshot: { worldMinutes: number }; applyDayTint(): void;
      } | undefined } };
    }).__YGG_GAME?.scene.getScene("world");
    if (!world) return;
    world.snapshot = { ...world.snapshot, worldMinutes: 22 * 60 };
    world.applyDayTint();
  });
  expect((await takeAnimations(page)).join(" "), "nightfall should ease in rather than flicker")
    .toContain("world:counter");

  // A battle, for the feedback that only exists there.
  await page.evaluate(async () => {
    const game = (window as unknown as { __YGG_GAME?: {
      registry: { get(key: string): { startEncounter(id: string): Promise<void> } };
      scene: { getScene(name: string): { scene: { start(key: string): void } } };
    } }).__YGG_GAME;
    await game?.registry.get("yggdrasil.bridge").startEncounter("encounter.mossroad-foragers");
    game?.scene.getScene("world").scene.start("battle");
  });
  await expect(page.locator("#app")).toHaveAttribute("data-scene", "battle");
  await page.waitForTimeout(600);

  await recordAnimations(page, "battle");
  await takeAnimations(page);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1100);
  const inBattle = (await takeAnimations(page)).join(" ");

  expect(inBattle, "health should drain rather than jump").toContain("battle:Rectangle:scaleX");
  expect(inBattle, "damage numbers should float off the target").toContain("battle:Text:alpha,y");
  expect(inBattle, "a struck combatant should recoil").toContain("battle:Image:x");
  expect(inBattle, "the active-actor ring should breathe").toContain("battle:Arc:scale");
});
