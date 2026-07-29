import "./styles.css";
import { createYggdrasilGame } from "./game";
import { EngineGameBridge } from "./integration/EngineGameBridge";
import { applySettingsToPhaserGame, gameSettingsStore } from "./settings";

const bridge = new EngineGameBridge();
await bridge.initialize();
const app = document.querySelector<HTMLElement>("#app");
if (app) {
  app.setAttribute("role", "application");
  app.setAttribute("aria-label", "Yggdrasil Chronicles game");
  const reflectSnapshot = (snapshot: ReturnType<EngineGameBridge["getSnapshot"]>): void => {
    app.dataset.locationId = snapshot.locationId;
    app.dataset.battleState = snapshot.battle?.phase ?? "none";
    app.dataset.factionStandingCount = String(snapshot.reputation?.factions.length ?? 0);
    app.dataset.relationshipCount = String(snapshot.reputation?.relationships.length ?? 0);
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
applySettingsToPhaserGame(gameSettingsStore.get(), game);
gameSettingsStore.subscribe((settings) => applySettingsToPhaserGame(settings, game));
