import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBOARD_BINDINGS } from "../settings";
import {
  keyboardActionForCode,
  keyboardCodeLabel,
  rebindKeyboardAction
} from "./keyboardControls";

describe("keyboard controls", () => {
  it("resolves the persisted physical key code", () => {
    expect(keyboardActionForCode("KeyJ", DEFAULT_KEYBOARD_BINDINGS)).toBe("journal");
    expect(keyboardActionForCode("KeyZ", DEFAULT_KEYBOARD_BINDINGS)).toBeUndefined();
  });

  it("swaps conflicting keys so neither action becomes unreachable", () => {
    const rebound = rebindKeyboardAction(DEFAULT_KEYBOARD_BINDINGS, "journal", "KeyI");
    expect(rebound.journal).toBe("KeyI");
    expect(rebound.inventory).toBe("KeyJ");
    expect(new Set(Object.values(rebound)).size).toBe(Object.keys(rebound).length);
  });

  it("formats browser codes for player-facing menus", () => {
    expect(keyboardCodeLabel("KeyP")).toBe("P");
    expect(keyboardCodeLabel("ArrowLeft")).toBe("Left");
    expect(keyboardCodeLabel("Escape")).toBe("Esc");
  });
});
