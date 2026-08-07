import "./styles.css";
import { applyMusicSettings, applyPresentationSettings, createYggdrasilGame, mountTouchControls, prefersTouchControls } from "./game";
import { EngineGameBridge } from "./integration/EngineGameBridge";
import { applySettingsToPhaserGame, gameSettingsStore } from "./settings";

const bridge = new EngineGameBridge();
// A top-level await with no boundary meant any storage failure aborted the
// module and left an empty <div id="app"> — a blank page with no explanation.
// initialize() no longer throws, but a boundary here keeps a future failure
// anywhere in bootstrap from costing the player the whole product.
try {
  await bridge.initialize();
} catch (error) {
  console.error("Bootstrap failed while preparing saves; starting without persistence.", error);
}
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
// for __MISSING textures. Reading it mutates nothing.
(window as unknown as { __YGG_GAME?: unknown }).__YGG_GAME = game;
// The 720px breakpoint in styles.css has always promised a phone build. On a
// touch device the game now has controls to match it; on a desktop pointer
// nothing is mounted, so the pad never covers a canvas nobody is tapping.
if (app && prefersTouchControls()) {
  app.dataset.touchControls = "on";
  mountTouchControls(app);
}
// The canvas palette and type scale are preferences too, and they have to be
// in place before the first scene draws.
applyPresentationSettings(gameSettingsStore.get());
applySettingsToPhaserGame(gameSettingsStore.get(), game);
gameSettingsStore.subscribe((settings) => {
  applyPresentationSettings(settings);
  applySettingsToPhaserGame(settings, game);
  applyMusicSettings(game);
});
