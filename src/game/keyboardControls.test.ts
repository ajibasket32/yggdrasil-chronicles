import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBOARD_BINDINGS } from "../settings";
import {
  keyboardActionForCode,
  keyboardBindingLabel,
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
    // An explicit binding replaces the whole list; the displaced action keeps
    // what the new one gave up rather than being left unbound.
    expect(rebound.journal).toEqual(["KeyI"]);
    expect(rebound.inventory).toEqual(["KeyJ"]);
    const claimed = Object.values(rebound).flat();
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it("keeps WASD alongside the arrow keys until a player rebinds movement", () => {
    for (const [code, action] of [["KeyW", "up"], ["KeyS", "down"], ["KeyA", "left"], ["KeyD", "right"]] as const) {
      expect(keyboardActionForCode(code, DEFAULT_KEYBOARD_BINDINGS)).toBe(action);
    }
    for (const [code, action] of [["ArrowUp", "up"], ["ArrowDown", "down"], ["ArrowLeft", "left"], ["ArrowRight", "right"]] as const) {
      expect(keyboardActionForCode(code, DEFAULT_KEYBOARD_BINDINGS)).toBe(action);
    }
    // Rebinding is a deliberate choice and takes the whole action with it.
    const rebound = rebindKeyboardAction(DEFAULT_KEYBOARD_BINDINGS, "up", "KeyT");
    expect(rebound.up).toEqual(["KeyT"]);
    expect(keyboardActionForCode("KeyW", rebound)).toBeUndefined();
  });

  it("lists every key an action answers to", () => {
    expect(keyboardBindingLabel(DEFAULT_KEYBOARD_BINDINGS.up)).toBe("Up / W");
    expect(keyboardBindingLabel(DEFAULT_KEYBOARD_BINDINGS.cancel)).toBe("Esc");
    expect(keyboardBindingLabel([])).toBe("unbound");
  });

  it("formats browser codes for player-facing menus", () => {
    expect(keyboardCodeLabel("KeyP")).toBe("P");
    expect(keyboardCodeLabel("ArrowLeft")).toBe("Left");
    expect(keyboardCodeLabel("Escape")).toBe("Esc");
  });
});
