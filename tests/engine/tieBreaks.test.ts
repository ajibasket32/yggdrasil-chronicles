import { describe, expect, it } from "vitest";
import { compareIds, createCombatState, getInitiativeOrder } from "../../src/engine/combat";
import { baseStats, makeCombatant } from "./fixtures";

describe("rules tie-breaks do not depend on the host's locale", () => {
  it("orders ids by code unit", () => {
    // Estonian collation places z between s-caron and t, so a locale-sensitive
    // comparison inverts this pair on an et-EE host while leaving it alone on
    // en-US: one seed, two different initiative orders, two different fights.
    expect(compareIds("enemy.thorn-warden", "enemy.zephyr-shade")).toBeLessThan(0);
    expect(compareIds("enemy.zephyr-shade", "enemy.thorn-warden")).toBeGreaterThan(0);
    expect(compareIds("enemy.same", "enemy.same")).toBe(0);
  });

  it("sorts a tied initiative the same way regardless of collation", () => {
    // Enemies in an encounter are built from one shared level, so their agility
    // always ties and the id comparison alone decides the order of the fight.
    const ids = ["enemy.zephyr-shade", "enemy.thorn-warden", "enemy.ashling"];
    const enemies = ids.map((id) => makeCombatant(id, { stats: { ...baseStats } }));
    const hero = makeCombatant("hero-one", { isPlayerControlled: true });
    const order = getInitiativeOrder(createCombatState([hero], enemies, "tie-seed"));

    const enemyOrder = order.filter((id) => id.startsWith("enemy."));
    expect(enemyOrder).toEqual([...ids].sort((left, right) => compareIds(left, right)));
  });
});
