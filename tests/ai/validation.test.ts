import { describe, expect, it } from "vitest";
import { validateGeneratedPatch } from "../../src/ai/validation";
import { narrativeContext, validPatch } from "./fixtures";

describe("generated narrative validation", () => {
  it("accepts a bounded patch whose references are reachable", () => {
    const result = validateGeneratedPatch(validPatch(), narrativeContext(), {
      knownNpcIds: new Set(["npc.keeper"])
    });

    expect(result.report.valid).toBe(true);
    expect(result.patch?.id).toBe("generated.patch-1");
    expect(result.report.acceptedEntityIds)
      .toContain("generated.patch-1.quest.lantern-rumor");
  });

  it("rejects raw gameplay authority even when hidden in a nested object", () => {
    const unsafe = {
      ...validPatch(),
      events: [{
        ...validPatch().events[0],
        damage: 9
      }]
    };

    const result = validateGeneratedPatch(unsafe, narrativeContext());

    expect(result.report.valid).toBe(false);
    expect(result.report.errors.join(" ")).toContain("Forbidden gameplay-authority field");
  });

  it("rejects unknown assets, encounters, canon conflicts, and reward tiers", () => {
    const patch = validPatch({
      quests: [{ ...validPatch().quests[0]!, rewardTier: "boss" }],
      npcs: [{ ...validPatch().npcs[0]!, assetTag: "https://example.invalid/sprite.png" }],
      events: [{
        ...validPatch().events[0]!,
        description: "The Crown is already destroyed.",
        encounterId: "encounter.unknown"
      }]
    });

    const result = validateGeneratedPatch(patch, narrativeContext(), {
      forbiddenCanonTerms: ["Crown is already destroyed"]
    });

    expect(result.report.valid).toBe(false);
    expect(result.report.errors).toHaveLength(4);
  });

  it("rejects broken dialogue graphs and unreachable generated quests", () => {
    const patch = validPatch({
      dialogue: [{
        id: "loop",
        speakerId: "npc.keeper",
        text: "There is no beginning.",
        nextIds: ["loop"]
      }],
      effects: []
    });

    const result = validateGeneratedPatch(patch, narrativeContext());

    expect(result.report.errors).toContain("Dialogue graph has no reachable root.");
    expect(result.report.errors.some((error) => error.includes("is unreachable"))).toBe(true);
  });
});
