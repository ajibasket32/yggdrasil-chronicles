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
  };
  reflectSnapshot(bridge.getSnapshot());
  bridge.subscribe(reflectSnapshot);
}
const game = createYggdrasilGame({ parent: "app", bridge });
applySettingsToPhaserGame(gameSettingsStore.get(), game);
gameSettingsStore.subscribe((settings) => applySettingsToPhaserGame(settings, game));
