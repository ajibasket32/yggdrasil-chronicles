import { describe, expect, it } from "vitest";
import {
  encounterFinds,
  locationEncounters,
  locationFinds,
  quests,
  vendorProfiles
} from "../../src/content";
import { selectEncounterForLocation } from "../../src/game/worldNavigation";
import type { QuestView } from "../../src/game/bridge";

const questView = (
  objectiveKind: NonNullable<QuestView["objectiveKind"]>,
  objectiveTargetId: string
): QuestView => ({
  id: "quest.probe",
  title: "Probe",
  summary: "Probe",
  state: "active",
  objective: `${objectiveKind} ${objectiveTargetId}`,
  objectiveKind,
  objectiveTargetId
});

/**
 * Encounters a player can actually meet without the given quest driving the
 * choice — the location default, or one another quest's objective selects.
 */
function encountersReachableWithout(questId: string): Set<string> {
  const reachable = new Set<string>();
  for (const [locationId, ids] of Object.entries(locationEncounters)) {
    for (const complete of [false, true]) {
      const fallback = selectEncounterForLocation(locationId, undefined, complete);
      if (fallback) reachable.add(fallback);
      for (const other of quests) {
        if (other.id === questId) continue;
        for (const otherStep of other.steps) {
          const picked = selectEncounterForLocation(
            locationId,
            questView(otherStep.kind, otherStep.targetId),
            complete
          );
          if (picked && ids.includes(picked)) reachable.add(picked);
        }
      }
    }
  }
  return reachable;
}

/** Every way to obtain an item that does not depend on `questId` being active. */
function obtainableWithout(itemId: string, questId: string): boolean {
  if (Object.values(locationFinds).some((finds) => finds.some(([id]) => id === itemId))) return true;
  if (vendorProfiles.some((vendor) => vendor.catalogItemIds.includes(itemId))) return true;
  const reachable = encountersReachableWithout(questId);
  return Object.entries(encounterFinds)
    .some(([encounterId, finds]) => reachable.has(encounterId) && finds.some(([id]) => id === itemId));
}

describe("every authored quest can actually be started", () => {
  /**
   * A side quest begins when an objective event matches its first step, so a
   * `collect` opener means the player must already be able to obtain that item.
   * The Ferrier's Lantern asked for wicks that drop only from an encounter the
   * road offers while a quest is asking for those wicks — it gated itself
   * behind its own reward, and nothing in the gates noticed.
   */
  it("never gates a quest behind an item only that quest can make obtainable", () => {
    const unstartable: string[] = [];
    for (const quest of quests) {
      if (quest.mainStory) continue;
      const opener = quest.steps[0];
      if (!opener || opener.kind !== "collect") continue;
      if (!obtainableWithout(opener.targetId, quest.id)) {
        unstartable.push(`${quest.id} needs ${opener.targetId}, which only it can unlock`);
      }
    }
    expect(unstartable).toEqual([]);
  });

  it("opens every side quest on something a player can trigger", () => {
    const openers = new Set(["talk", "travel", "collect", "defeat", "survive", "deliver"]);
    for (const quest of quests) {
      const opener = quest.steps[0];
      expect(opener, quest.id).toBeDefined();
      expect(openers.has(opener!.kind), `${quest.id} opens on ${opener!.kind}`).toBe(true);
    }
  });
});
