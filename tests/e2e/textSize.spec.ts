import { expect, test, type Page } from "@playwright/test";

/**
 * Every overlay body is masked to the panel, and every list panel windows
 * itself to a row budget. Those budgets were counted once at the default text
 * size while row height scales with the player's preference, so at `large` the
 * body outgrew its mask: rows were cut, and the line that got cut first was the
 * panel's own "▼ more below" — the only sign that anything had been cut at all.
 *
 * The invariant is simply that the body fits the window it is masked to. It is
 * asserted at the largest text size, where the margin is thinnest, across the
 * panels a player actually navigates.
 */

const CLIP_TOP = 126;
const CLIP_HEIGHT = 330;

async function openWorldAtLargestText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "yggdrasil-chronicles.settings.v2",
      JSON.stringify({
        version: 1,
        textSize: "large",
        highContrast: false,
        reducedMotion: false,
        soundEnabled: false,
        soundVolume: 0.5,
        musicEnabled: false,
        musicVolume: 0.5
      })
    );
  });
  await page.goto("/");
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-scene", "title", { timeout: 20000 });
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
  await page.waitForTimeout(200);
}

/** The open overlay's body height, and whether a marker overlaps a body row. */
async function measureOverlay(page: Page): Promise<{
  height: number;
  clip: number;
  markerInsideBody: boolean;
  markerCount: number;
}> {
  return page.evaluate(
    ({ top }) => {
      const game = (window as unknown as { __YGG_GAME?: {
        scene: { scenes: { scene: { key: string }; overlay?: { list: unknown[] } }[] };
      } }).__YGG_GAME;
      const world = game?.scene.scenes.find((candidate) => candidate.scene.key === "world");
      const list = (world?.overlay?.list ?? []) as {
        type: string; y: number; height: number; text?: string;
      }[];
      const texts = list.filter((child) => child.type === "Text");
      const body = texts.find((child) => Math.round(child.y) === top);
      const markers = texts.filter((child) => String(child.text ?? "").includes("more below")
        && Math.round(child.y) !== top);
      const clipped = list.find((child) => child.type === "Graphics") as
        { commandBuffer?: number[] } | undefined;
      // The mask height is the fourth argument of the single fillRect command.
      const clip = clipped?.commandBuffer?.slice(-1)[0] ?? 0;
      return {
        height: Math.round(body?.height ?? 0),
        clip: Math.round(typeof clip === "number" ? clip : 0),
        markerCount: markers.length,
        markerInsideBody: markers.some((marker) => marker.y < top + Math.round(body?.height ?? 0))
      };
    },
    { top: CLIP_TOP }
  );
}

test("no overlay outgrows its window at the largest text size", async ({ page }) => {
  await openWorldAtLargestText(page);

  // Each panel, with the navigation that pushes its window off the top — the
  // state where both "more above" and "more below" rows exist and the body is
  // at its tallest.
  const panels: { name: string; key: string; scrolls: number }[] = [
    { name: "system", key: "Escape", scrolls: 6 },
    { name: "journal", key: "j", scrolls: 2 },
    { name: "party", key: "p", scrolls: 0 },
    { name: "map", key: "m", scrolls: 2 }
  ];

  for (const panel of panels) {
    await page.keyboard.press(panel.key);
    await page.waitForTimeout(350);
    for (let step = 0; step < panel.scrolls; step += 1) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(200);

    const measured = await measureOverlay(page);
    expect(measured.height, `${panel.name} body height`).toBeGreaterThan(0);
    expect(
      measured.height,
      `${panel.name} overflows its ${measured.clip}px window at the largest text size`
    ).toBeLessThanOrEqual(measured.clip);
    expect(
      measured.markerInsideBody,
      `${panel.name} draws its overflow marker on top of a body row`
    ).toBe(false);
    // A panel that windows itself already says "more below" in its own text; a
    // second floating marker beside it is a duplicate.
    expect(measured.markerCount, `${panel.name} marker count`).toBeLessThanOrEqual(1);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  expect(CLIP_HEIGHT).toBe(330);
});

/**
 * The same failure mode outside the overlays: the title screen and the world
 * HUD both place text below a block whose height changes with the setting. At
 * `large` the overwrite warning wraps to two lines and the HUD's route
 * paragraph grows, and either can push what follows off the bottom of a canvas
 * that never changes size.
 */
test("no title or HUD text falls off the canvas at the largest text size", async ({ page }) => {
  await openWorldAtLargestText(page);
  const app = page.locator("#app");

  const hud = await page.evaluate(() => {
    const game = (window as unknown as { __YGG_GAME?: {
      scale: { height: number };
      scene: { scenes: { scene: { key: string }; children: { list: unknown[] } }[] };
    } }).__YGG_GAME;
    const world = game?.scene.scenes.find((candidate) => candidate.scene.key === "world");
    const texts = ((world?.children.list ?? []) as { type: string; x: number; y: number; height: number; text?: string }[])
      .filter((child) => child.type === "Text" && child.x >= 700);
    return {
      canvasHeight: game?.scale.height ?? 0,
      lowest: Math.max(0, ...texts.map((child) => Math.round(child.y + child.height))),
      count: texts.length
    };
  });
  expect(hud.count, "no HUD text was found to measure").toBeGreaterThan(0);
  expect(hud.lowest, "HUD text runs past the bottom of the canvas").toBeLessThanOrEqual(hud.canvasHeight);

  // Back to the title with a save on disk, so the overwrite warning renders and
  // the controls legend has to sit below it.
  await page.reload();
  await expect(app).toHaveAttribute("data-scene", "title", { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);

  const title = await page.evaluate(() => {
    const game = (window as unknown as { __YGG_GAME?: {
      scale: { height: number };
      scene: { scenes: { scene: { key: string }; children: { list: unknown[] } }[] };
    } }).__YGG_GAME;
    const scene = game?.scene.scenes.find((candidate) => candidate.scene.key === "title");
    const texts = ((scene?.children.list ?? []) as { type: string; y: number; height: number; text?: string }[])
      .filter((child) => child.type === "Text");
    const notice = texts.find((child) => String(child.text ?? "").includes("will be overwritten"));
    const legend = texts.find((child) => String(child.text ?? "").includes("Navigate"));
    return {
      canvasHeight: game?.scale.height ?? 0,
      noticeBottom: notice ? Math.round(notice.y + notice.height) : undefined,
      legendTop: legend ? Math.round(legend.y) : undefined,
      legendBottom: legend ? Math.round(legend.y + legend.height) : undefined
    };
  });
  expect(title.noticeBottom, "the overwrite warning never appeared").toBeDefined();
  expect(title.legendTop, "the controls legend never appeared").toBeDefined();
  expect(title.legendTop!, "the legend is drawn through the overwrite warning")
    .toBeGreaterThanOrEqual(title.noticeBottom!);
  expect(title.legendBottom!, "the legend runs past the bottom of the canvas")
    .toBeLessThanOrEqual(title.canvasHeight);
});

/**
 * The title scene draws four more screens behind the same fixed canvas, and
 * they were never checked at the largest text size either. Character creation's
 * detail column reached 588 on a 540 canvas — cutting off the "Watch for" line
 * written to guide exactly the choice being made on that screen — and the
 * settings list ran its last two rows, Music Volume and Keyboard Bindings, off
 * the bottom entirely while the controls legend was drawn through the row above.
 */
test("no title sub-screen runs off the canvas at the largest text size", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "yggdrasil-chronicles.settings.v2",
      JSON.stringify({
        version: 1, textSize: "large", highContrast: false, reducedMotion: false,
        soundEnabled: false, soundVolume: 0.5, musicEnabled: false, musicVolume: 0.5
      })
    );
  });
  await page.goto("/");
  const app = page.locator("#app");
  await expect(app).toHaveAttribute("data-scene", "title", { timeout: 20000 });
  await page.waitForTimeout(900);

  const measure = async (): Promise<{ canvas: number; lowest: number; text: string; count: number }> =>
    page.evaluate(() => {
      const game = (window as unknown as { __YGG_GAME?: {
        scale: { height: number };
        scene: { scenes: { scene: { key: string }; children: { list: unknown[] } }[] };
      } }).__YGG_GAME;
      const scene = game?.scene.scenes.find((candidate) => candidate.scene.key === "title");
      const texts = ((scene?.children.list ?? []) as {
        type: string; y: number; height: number; visible: boolean; text?: string;
      }[]).filter((child) => child.type === "Text" && child.visible);
      const worst = texts.reduce(
        (lowestSoFar, child) => child.y + child.height > lowestSoFar.y + lowestSoFar.height ? child : lowestSoFar,
        texts[0] ?? { y: 0, height: 0, text: "" } as { y: number; height: number; text?: string }
      );
      return {
        canvas: game?.scale.height ?? 0,
        lowest: Math.round(worst.y + worst.height),
        text: String(worst.text ?? "").slice(0, 40),
        count: texts.length
      };
    });

  // Character creation, reached with one confirm from NEW CHRONICLE.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  const creation = await measure();
  expect(creation.count, "no creation text was found to measure").toBeGreaterThan(4);
  expect(creation.lowest, `character creation overflows: "${creation.text}"`)
    .toBeLessThanOrEqual(creation.canvas);

  // Then settings, three rows down from the title.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(140);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const settings = await measure();
  expect(settings.count, "no settings text was found to measure").toBeGreaterThan(4);
  expect(settings.lowest, `the settings screen overflows: "${settings.text}"`)
    .toBeLessThanOrEqual(settings.canvas);
});
