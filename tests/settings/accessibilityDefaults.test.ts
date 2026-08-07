import { describe, expect, it } from "vitest";
import { keyboardCodeLabel, loadKeyboardLayoutLabels } from "../../src/game/keyboardControls";
import { loadGameSettings, systemPrefersReducedMotion } from "../../src/settings/runtime";

describe("the system's own accessibility preferences are the starting point", () => {
  const fakeWindow = (reduce: boolean): Window =>
    ({ matchMedia: (query: string) => ({ matches: query.includes("reduce") && reduce }) }) as unknown as Window;

  it("reads prefers-reduced-motion rather than assuming it is off", () => {
    expect(systemPrefersReducedMotion(fakeWindow(true))).toBe(true);
    expect(systemPrefersReducedMotion(fakeWindow(false))).toBe(false);
    expect(systemPrefersReducedMotion(undefined)).toBe(false);
  });

  it("starts from the shipped defaults when nothing has been stored", () => {
    // No window in this environment, so the system signal is absent and the
    // defaults stand — the point is that the value is asked for at all.
    const settings = loadGameSettings(null);
    expect(settings.reducedMotion).toBe(false);
    expect(settings.textSize).toBe("medium");
  });
});

describe("control legends name the key in front of the player", () => {
  it("falls back to the code's US position when the browser will not say", () => {
    expect(keyboardCodeLabel("KeyW")).toBe("W");
    expect(keyboardCodeLabel("ArrowUp")).toBe("Up");
    expect(keyboardCodeLabel("Escape")).toBe("Esc");
  });

  it("prefers what the keyboard actually prints once the layout is known", async () => {
    // An AZERTY board prints Z where a US board prints W. Telling that player
    // to press "W" names a key their keyboard does not have.
    await loadKeyboardLayoutLabels({
      keyboard: {
        getLayoutMap: async () => new Map([["KeyW", "z"], ["KeyA", "q"]])
      }
    } as unknown as Navigator);

    expect(keyboardCodeLabel("KeyW")).toBe("Z");
    expect(keyboardCodeLabel("KeyA")).toBe("Q");
    // Anything the map does not name still falls back.
    expect(keyboardCodeLabel("ArrowDown")).toBe("Down");
  });
});
