import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/engine/state";
import { makePlayerCharacter } from "./fixtures";

describe("initial game state", () => {
  it("creates a complete offline session snapshot", () => {
    const state = createInitialGameState({
      seed: "new-game",
      startingLocationId: "location-hushharbor",
      party: [makePlayerCharacter()],
      contentPackVersions: { core: "1.0.0" }
    });
    expect(state.world.currentLocationId).toBe("location-hushharbor");
    expect(state.world.discoveredLocationIds).toEqual(["location-hushharbor"]);
    expect(state.generatedPatches).toEqual([]);
    expect(state.pendingTriggers).toEqual([]);
  });

  it("rejects parties larger than four", () => {
    expect(() => createInitialGameState({
      seed: "crowded",
      startingLocationId: "location-hushharbor",
      party: [1, 2, 3, 4, 5].map((id) => makePlayerCharacter(`hero-${id}`)),
      contentPackVersions: { core: "1.0.0" }
    })).toThrow(/one and four/);
  });
});

