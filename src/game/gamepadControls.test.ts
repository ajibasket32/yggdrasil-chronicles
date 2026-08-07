import { describe, expect, it } from "vitest";
import { gamepadButtonAction } from "./gamepadControls";
import { getNpcSpawnPoints } from "./npcPlacement";

describe("standard gamepad controls", () => {
  it("maps navigation, confirmation, cancellation, and game menus", () => {
    expect([12, 13, 14, 15].map(gamepadButtonAction)).toEqual(["up", "down", "left", "right"]);
    expect([0, 1, 2, 3, 4, 9].map(gamepadButtonAction)).toEqual([
      "confirm", "cancel", "journal", "party", "inventory", "system"
    ]);
  });

  it("gives the world map a button, which it did not have", () => {
    // Journal, party and inventory were all mapped and the map was not, so a
    // gamepad player could not open it at all. The right bumper sits beside
    // inventory on the left.
    expect(gamepadButtonAction(5)).toBe("map");
  });
});

describe("NPC placement", () => {
  it("gives every town resident a unique, approachable tile", () => {
    const points = getNpcSpawnPoints(6);
    expect(points).toHaveLength(6);
    expect(new Set(points.map(({ x, y }) => `${x},${y}`)).size).toBe(6);
    expect(points.every(({ x, y }) => x > 0 && x < 22 && y > 0 && y < 16)).toBe(true);
  });
});
