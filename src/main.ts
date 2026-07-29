import "./styles.css";
import { createYggdrasilGame } from "./game";
import { EngineGameBridge } from "./integration/EngineGameBridge";

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
createYggdrasilGame({ parent: "app", bridge });
