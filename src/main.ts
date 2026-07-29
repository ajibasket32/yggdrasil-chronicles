import "./styles.css";
import { createYggdrasilGame } from "./game";
import { EngineGameBridge } from "./integration/EngineGameBridge";

const bridge = new EngineGameBridge();
await bridge.initialize();
createYggdrasilGame({ parent: "app", bridge });
