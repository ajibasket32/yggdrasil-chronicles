import { describe, expect, it } from "vitest";
import { applyGeneratedPatch } from "../../src/ai/applyPatch";
import { validateGeneratedPatch } from "../../src/ai/validation";
import { emptyGameState, narrativeContext, validPatch } from "./fixtures";

describe("atomic generated patch application", () => {
  it("applies whitelisted effects without mutating the previous state", () => {
    const before = emptyGameState();
    const patch = validPatch({
      effects: [
        { type: "unlock_generated_quest", questLocalId: "lantern-rumor" },
        { type: "create_generated_flag", key: "generated.lantern.returned", value: true },
        { type: "adjust_relationship", npcId: "npc.keeper", axis: "trust", amount: 5 },
        { type: "add_chronicle_entry", title: "The Lantern", body: "It was returned." }
      ]
    });
    const { report } = validateGeneratedPatch(patch, narrativeContext(), {
      knownNpcIds: new Set(["npc.keeper"])
    });

    const result = applyGeneratedPatch(before, patch, report);

    expect(result.applied).toBe(true);
    expect(result.state).not.toBe(before);
    expect(before.world.flags).toEqual({});
    expect(before.world.relationships[0]?.trust).toBe(99);
    expect(result.state.world.relationships[0]?.trust).toBe(100);
    expect(result.state.world.flags["generated.lantern.returned"]).toBe(true);
    expect(result.state.quests[0]).toMatchObject({
      questId: "generated.patch-1.quest.lantern-rumor",
      state: "available"
    });
    expect(result.state.pendingTriggers).toHaveLength(0);
  });

  it("returns the original state when validation failed", () => {
    const before = emptyGameState();
    const patch = validPatch({ triggerId: "wrong-trigger" });
    const { report } = validateGeneratedPatch(patch, narrativeContext());

    const result = applyGeneratedPatch(before, patch, report);

    expect(result.applied).toBe(false);
    expect(result.state).toBe(before);
  });
});
