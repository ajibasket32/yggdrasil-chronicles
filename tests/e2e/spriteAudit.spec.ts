import { expect, test, type Page } from "@playwright/test";

/**
 * Missing-sprite audit: walks the whole game and, at every beat, sweeps every
 * active scene's display list for objects whose texture resolved to Phaser's
 * __MISSING placeholder (the green box a player reports as a missing sprite),
 * plus frames that fell back to __BASE on a spritesheet (an out-of-range
 * frame index renders the entire sheet — equally wrong, differently ugly).
 * PLAYTEST=1, on demand.
 */
test.describe("@playtest", () => {
  test.skip(process.env.PLAYTEST !== "1", "on-demand audit, set PLAYTEST=1");
  test.setTimeout(600_000);

  async function pressRepeatedly(page: Page, key: string, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await page.keyboard.press(key);
      await page.waitForTimeout(140);
    }
  }

  /** Reads the world scene's player tile, straight from the game. */
  async function grid(page: Page): Promise<{ x: number; y: number } | undefined> {
    return page.evaluate(() => {
      const game = (window as unknown as { __YGG_GAME?: { scene: { getScene(key: string): unknown } } }).__YGG_GAME;
      const world = game?.scene.getScene("world") as { playerGrid?: { x: number; y: number } } | undefined;
      return world?.playerGrid;
    });
  }

  /** The current map's encounter tile, if a foe is spawned. */
  async function encounterTile(page: Page): Promise<{ x: number; y: number } | undefined> {
    return page.evaluate(() => {
      const game = (window as unknown as { __YGG_GAME?: { scene: { getScene(key: string): unknown } } }).__YGG_GAME;
      const world = game?.scene.getScene("world") as { encounterSprite?: { x: number; y: number } } | undefined;
      const sprite = world?.encounterSprite;
      return sprite ? { x: Math.round((sprite.x - 16) / 32), y: Math.round((sprite.y - 16) / 32) } : undefined;
    });
  }

  /** Greedy grid walk with a jiggle when a villager blocks the lane. */
  async function walkToTile(page: Page, target: { x: number; y: number }): Promise<void> {
    for (let step = 0; step < 80; step += 1) {
      const at = await grid(page);
      if (!at || (at.x === target.x && at.y === target.y)) return;
      const key = Math.abs(target.x - at.x) >= Math.abs(target.y - at.y)
        ? (target.x > at.x ? "ArrowRight" : "ArrowLeft")
        : (target.y > at.y ? "ArrowDown" : "ArrowUp");
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
      const after = await grid(page);
      if (after && at.x === after.x && at.y === after.y) {
        await page.keyboard.press(Math.abs(target.x - at.x) >= Math.abs(target.y - at.y)
          ? (step % 2 === 0 ? "ArrowDown" : "ArrowUp")
          : (step % 2 === 0 ? "ArrowRight" : "ArrowLeft"));
        await page.waitForTimeout(150);
      }
    }
  }

  /** Walks off an edge until the border crossing registers. */
  async function crossTo(page: Page, app: ReturnType<Page["locator"]>, direction: "ArrowRight" | "ArrowLeft" | "ArrowUp" | "ArrowDown", locationId: string): Promise<void> {
    for (let step = 0; step < 50; step += 1) {
      if (await app.getAttribute("data-location-id") === locationId) return;
      const at = await grid(page);
      await page.keyboard.press(direction);
      await page.waitForTimeout(160);
      const after = await grid(page);
      if (at && after && at.x === after.x && at.y === after.y
        && await app.getAttribute("data-location-id") !== locationId) {
        await page.keyboard.press(step % 2 === 0 ? "ArrowDown" : "ArrowUp");
        await page.waitForTimeout(150);
      }
    }
  }

  /** Advances any scripted scene until input is free again. */
  async function clearScene(page: Page, app: ReturnType<Page["locator"]>): Promise<void> {
    for (let press = 0; press < 40; press += 1) {
      if (await app.getAttribute("data-pending-scene") === "none") return;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(140);
    }
  }

  async function sweep(page: Page, beat: string): Promise<string[]> {
    await page.waitForTimeout(250);
    return page.evaluate((label) => {
      interface AuditGameObject {
        type?: string;
        texture?: { key?: string; frameTotal?: number };
        frame?: { name?: string | number };
        x?: number;
        y?: number;
        visible?: boolean;
        list?: AuditGameObject[];
      }
      const game = (window as unknown as { __YGG_GAME?: { scene: { scenes: Array<{ scene: { key: string; isActive(): boolean }; children?: { list: AuditGameObject[] } }> } } }).__YGG_GAME;
      if (!game) return [`${label}: __YGG_GAME missing — audit cannot run`];
      const findings: string[] = [];
      const walk = (objects: AuditGameObject[], sceneKey: string): void => {
        for (const object of objects) {
          if (object.list) walk(object.list, sceneKey);
          const key = object.texture?.key;
          if (key === undefined) continue;
          if (key === "__MISSING" || key === "__DEFAULT") {
            findings.push(`${label} [${sceneKey}] ${object.type} at ${Math.round(object.x ?? -1)},${Math.round(object.y ?? -1)}: texture ${key}`);
          }
          // A frame that fell back to the whole sheet: frame name __BASE on a
          // multi-frame texture means an out-of-range frame index.
          if ((object.texture?.frameTotal ?? 0) > 2 && object.frame?.name === "__BASE") {
            findings.push(`${label} [${sceneKey}] ${object.type} at ${Math.round(object.x ?? -1)},${Math.round(object.y ?? -1)}: __BASE frame of ${key}`);
          }
        }
      };
      for (const scene of game.scene.scenes) {
        if (scene.scene.isActive() && scene.children) walk(scene.children.list, scene.scene.key);
      }
      return findings;
    }, beat);
  }

  test("no beat of a full session shows a missing texture", async ({ page }) => {
    const findings: string[] = [];
    const audit = async (beat: string): Promise<void> => {
      findings.push(...await sweep(page, beat));
    };
    const app = page.locator("#app");

    await page.goto("/");
    await expect(page.locator("canvas")).toBeVisible();
    await expect(app).toHaveAttribute("data-scene", "title");
    await audit("title");

    await pressRepeatedly(page, "Enter", 6);
    await expect(app).toHaveAttribute("data-scene", "world");
    await audit("prologue");
    for (let press = 0; press < 40; press += 1) {
      if (await app.getAttribute("data-pending-scene") === "none") break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(140);
    }
    await audit("hearthcross");

    // Dialogue with a portrait.
    await pressRepeatedly(page, "ArrowRight", 2);
    await page.keyboard.press("e");
    await page.waitForTimeout(400);
    await audit("dialogue");
    for (let press = 0; press < 40; press += 1) {
      if (await app.getAttribute("data-dialogue") === "none") break;
      await page.keyboard.press("e");
      await page.waitForTimeout(140);
    }

    // Every overlay.
    for (const [key, name] of [["j", "journal"], ["m", "map"], ["h", "codex"], ["p", "party"], ["i", "inventory"]] as const) {
      await page.keyboard.press(key);
      await page.waitForTimeout(350);
      await audit(name);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
    await audit("system-menu");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    // Wilderness, dungeon, battle.
    await pressRepeatedly(page, "ArrowUp", 2);
    await pressRepeatedly(page, "ArrowRight", 17);
    await expect(app).toHaveAttribute("data-location-id", "location.mossroad");
    await audit("mossroad");
    await pressRepeatedly(page, "ArrowUp", 7);
    await expect(app).toHaveAttribute("data-location-id", "location.hollow-root");
    await clearScene(page, app);
    await audit("hollow-root-dungeon");
    await crossTo(page, app, "ArrowDown", "location.mossroad");
    await clearScene(page, app);
    const foe = await encounterTile(page);
    expect(foe, "an encounter should be spawned on the Mossroad").toBeDefined();
    await walkToTile(page, { x: foe!.x, y: foe!.y - 1 });
    await page.keyboard.press("b");
    await expect(app).toHaveAttribute("data-scene", "battle");
    await audit("battle-start");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await audit("battle-skill-menu");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    await audit("battle-mid");
    for (let round = 0; round < 30; round += 1) {
      const state = await app.getAttribute("data-battle-state");
      if (state === "victory" || state === "defeat" || state === "escaped") break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
    }
    await audit("battle-end");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await expect(app).toHaveAttribute("data-scene", "world");

    // On to Emberwake, wherever the battle return placed the party.
    await crossTo(page, app, "ArrowRight", "location.emberwake");
    await expect(app).toHaveAttribute("data-location-id", "location.emberwake");
    await audit("emberwake-arrival-scene");
    for (let press = 0; press < 40; press += 1) {
      if (await app.getAttribute("data-pending-scene") === "none") break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(140);
    }
    await audit("emberwake");
    await page.keyboard.press("Escape");
    await pressRepeatedly(page, "ArrowDown", 7);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await audit("remedies-ledger");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    // The Cinder March road: region-two enemies use the humanoid and small
    // sheets with their own tints — audit them live in battle.
    await crossTo(page, app, "ArrowRight", "location.ashfall-trail");
    await clearScene(page, app);
    await audit("ashfall-trail");
    const ashFoe = await encounterTile(page);
    if (ashFoe) {
      await walkToTile(page, { x: ashFoe.x, y: ashFoe.y - 1 });
      await page.keyboard.press("b");
      await expect(app).toHaveAttribute("data-scene", "battle");
      await audit("battle-region2");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      for (let press = 0; press < 10 && await app.getAttribute("data-scene") !== "world"; press += 1) {
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
      }
      await audit("after-escape");
    }

    if (findings.length > 0) console.log("MISSING TEXTURES:\n" + findings.join("\n"));
    expect(findings, findings.join("\n")).toHaveLength(0);
  });
});
