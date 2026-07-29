import { describe, expect, it } from "vitest";
import type { GameSnapshot, QuestView } from "../../src/game/bridge";
import {
  getLocationExits,
  getObjectiveGuidance,
  selectEncounterForLocation
} from "../../src/game/worldNavigation";

const snapshotWith = (locationId: string, quest: QuestView): GameSnapshot => ({
  hasSave: true,
  playerName: "Rowan",
  locationId,
  locationName: locationId,
  worldMinutes: 480,
  party: [],
  inventory: [],
  quests: [quest],
  autosave: "saved",
  chronicleHint: ""
});

const activeQuest = (
  objectiveKind: NonNullable<QuestView["objectiveKind"]>,
  objectiveTargetId: string
): QuestView => ({
  id: "quest.test",
  title: "Test Thread",
  summary: "Test",
  state: "active",
  objective: `${objectiveKind} ${objectiveTargetId}`,
  objectiveKind,
  objectiveTargetId
});

describe("world navigation guidance", () => {
  it("maps authored roads to unambiguous keyboard edges", () => {
    expect(getLocationExits("location.mossroad")).toEqual([
      { direction: "left", targetId: "location.hearthcross", targetName: "Hearthcross" },
      { direction: "up", targetId: "location.hollow-root", targetName: "Hollow Root" },
      { direction: "right", targetId: "location.emberwake", targetName: "Emberwake" }
    ]);
  });

  it("marks a local NPC objective", () => {
    const guidance = getObjectiveGuidance(
      snapshotWith("location.hearthcross", activeQuest("talk", "npc.mara-vell"))
    );
    expect(guidance).toMatchObject({
      local: true,
      targetEntityId: "npc.mara-vell",
      targetLocationId: "location.hearthcross",
      message: "HERE  Speak with Mara Vell"
    });
  });

  it("points to the first road on a multi-location objective route", () => {
    const guidance = getObjectiveGuidance(
      snapshotWith("location.hearthcross", activeQuest("travel", "location.hollow-root"))
    );
    expect(guidance).toMatchObject({
      local: false,
      targetLocationId: "location.hollow-root",
      nextExit: {
        direction: "right",
        targetId: "location.mossroad"
      }
    });
  });

  it("selects the encounter that advances the active objective", () => {
    expect(selectEncounterForLocation(
      "location.silent-kiln",
      activeQuest("defeat", "enemy.cinder-wraith")
    )).toBe("encounter.kiln-watch");
    expect(selectEncounterForLocation(
      "location.silent-kiln",
      activeQuest("defeat", "enemy.kiln-heart")
    )).toBe("encounter.kiln-heart");
    expect(selectEncounterForLocation(
      "location.mossroad",
      activeQuest("collect", "item.lantern-wick")
    )).toBe("encounter.flooded-grove");
  });
});
