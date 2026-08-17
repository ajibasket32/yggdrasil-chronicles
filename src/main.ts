import "./styles.css";
import {
  applyMusicSettings,
  applyPresentationSettings,
  createYggdrasilGame,
  loadKeyboardLayoutLabels,
  mountTouchControls,
  prefersTouchControls
} from "./game";
import { EngineGameBridge } from "./integration/EngineGameBridge";
import { MemorySaveStorage, SaveRepository } from "./save";
import { applySettingsToPhaserGame, gameSettingsStore } from "./settings";

/**
 * Builds the bridge, and keeps a browser that refuses storage playing.
 *
 * Storage can fail before it is ever used: `indexedDB.open` throws
 * synchronously — SecurityError — when site data is blocked, in a sandboxed
 * iframe, or with IndexedDB disabled outright. That call sits inside
 * EngineGameBridge's own default arguments, so constructing the bridge
 * *outside* the boundary aborted module evaluation and left an empty
 * <div id="app">: the blank page the old comment here claimed to have closed,
 * one line too late to actually close it.
 *
 * Falling back to an in-memory repository costs the session its saves and
 * nothing else. `storageAvailable` already drives the "Saving is unavailable
 * in this browser session" notice, so the degraded mode is one the game is
 * built for.
 */
async function createBridge(): Promise<EngineGameBridge> {
  try {
    const persistent = new EngineGameBridge();
    await persistent.initialize();
    return persistent;
  } catch (error) {
    console.error("Save storage is unavailable; continuing without persistence.", error);
    const ephemeral = new EngineGameBridge(new SaveRepository(new MemorySaveStorage()));
    await ephemeral.initialize();
    return ephemeral;
  }
}

const bridge = await createBridge();
const app = document.querySelector<HTMLElement>("#app");
if (app) {
  app.setAttribute("role", "application");
  app.setAttribute("aria-label", "Yggdrasil Chronicles game");
  const reflectSnapshot = (snapshot: ReturnType<EngineGameBridge["getSnapshot"]>): void => {
    app.dataset.locationId = snapshot.locationId;
    app.dataset.battleState = snapshot.battle?.phase ?? "none";
    app.dataset.factionStandingCount = String(snapshot.reputation?.factions.length ?? 0);
    app.dataset.relationshipCount = String(snapshot.reputation?.relationships.length ?? 0);
    app.dataset.endingId = snapshot.campaign?.ending?.id ?? "none";
    app.dataset.pendingScene = snapshot.pendingScene?.id ?? "none";
    app.dataset.activeQuest = snapshot.quests.find(({ state }) => state === "active")?.id ?? "none";
    app.dataset.inventoryTotalQuantity = String(
      snapshot.inventory.reduce((total, item) => total + item.quantity, 0),
    );
    app.dataset.partyCurrentHp = String(
      snapshot.party.reduce((total, member) => total + member.hp, 0),
    );
  };
  reflectSnapshot(bridge.getSnapshot());
  bridge.subscribe(reflectSnapshot);
}
const game = createYggdrasilGame({ parent: "app", bridge });
// For the sprite-audit harness: lets a test sweep every scene's display list
// for __MISSING textures. Development only — the handle reaches the live
// bridge through the scenes, so shipping it hands anyone with devtools open
// direct edit access to inventory, party stats and quest flags in a save the
// game then persists. Playwright runs the dev server, so the audit still has it.
if (import.meta.env.DEV) {
  (window as unknown as { __YGG_GAME?: unknown }).__YGG_GAME = game;
}
// The 720px breakpoint in styles.css has always promised a phone build. On a
// touch device the game now has controls to match it; on a desktop pointer
// nothing is mounted, so the pad never covers a canvas nobody is tapping.
if (app && prefersTouchControls()) {
  app.dataset.touchControls = "on";
  mountTouchControls(app);
}
// Ask the browser what this keyboard actually prints, so the control legends
// name the keys in front of the player rather than their US-layout positions.
// Resolves after the first draw; every legend is rebuilt on redraw anyway.
void loadKeyboardLayoutLabels();
// The canvas palette and type scale are preferences too, and they have to be
// in place before the first scene draws.
applyPresentationSettings(gameSettingsStore.get());
applySettingsToPhaserGame(gameSettingsStore.get(), game);
gameSettingsStore.subscribe((settings) => {
  applyPresentationSettings(settings);
  applySettingsToPhaserGame(settings, game);
  applyMusicSettings(game);
});

