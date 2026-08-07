import { describe, expect, it } from "vitest";
import { locationEncounters, quests } from "../../src/content";
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
  currency: 0,
  difficulty: "normal",
  party: [],
  inventory: [],
  quests: [quest],
  autosave: "saved",
  storageAvailable: true,
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

describe("postgame encounters become reachable once the campaign is finished", () => {
  it("offers the Starless Vault's ordinary encounter before the campaign ends", () => {
    expect(selectEncounterForLocation("location.starless-vault", undefined, false))
      .toBe("encounter.vault-echoes");
  });

  it("offers the postgame superboss once every main-story quest is done", () => {
    // Listed last at its location and named by no quest, so before this it
    // could never be selected at all — authored content no player could reach.
    expect(selectEncounterForLocation("location.starless-vault", undefined, true))
      .toBe("encounter.varn-echo");
  });

  it("still lets an active objective claim its own encounter after the campaign", () => {
    expect(selectEncounterForLocation(
      "location.starless-vault",
      activeQuest("collect", "item.star-key"),
      true
    )).toBe("encounter.vault-echoes");
  });

  it("leaves locations with no postgame encounter unchanged", () => {
    expect(selectEncounterForLocation("location.mossroad", undefined, true))
      .toBe(selectEncounterForLocation("location.mossroad", undefined, false));
  });
});

describe("no authored encounter is stranded", () => {
  /**
   * The validator already checks that every encounter is *listed* at some
   * location. Listing is not reachability: the selector returns one encounter
   * per location, so an entry that is neither the fallback nor named by any
   * quest objective can never be chosen. That is exactly how the postgame
   * superboss came to be fully authored and completely unreachable.
   */
  it("can be selected at its location by some reachable game state", () => {
    const stranded: string[] = [];
    for (const [locationId, encounterIds] of Object.entries(locationEncounters)) {
      for (const encounterId of encounterIds) {
        const selectable = [false, true].some((campaignComplete) => {
          if (selectEncounterForLocation(locationId, undefined, campaignComplete) === encounterId) {
            return true;
          }
          return quests.some((quest) => quest.steps.some((questStep) =>
            selectEncounterForLocation(
              locationId,
              activeQuest(questStep.kind, questStep.targetId),
              campaignComplete
            ) === encounterId));
        });
        if (!selectable) stranded.push(`${locationId} -> ${encounterId}`);
      }
    }
    expect(stranded).toEqual([]);
  });
});

describe("every objective kind gives the player a direction", () => {
  const withRecipient = (
    objectiveKind: NonNullable<QuestView["objectiveKind"]>,
    objectiveTargetId: string,
    objectiveRecipientId?: string
  ): QuestView => ({
    ...activeQuest(objectiveKind, objectiveTargetId),
    ...(objectiveRecipientId ? { objectiveRecipientId } : {})
  });

  it("points a delivery at whoever is waiting for the item", () => {
    // Fen Til keeps the Mossroad; the item itself is not a place to walk to.
    const guidance = getObjectiveGuidance(
      snapshotWith("location.hearthcross", withRecipient("deliver", "item.lantern-wick", "npc.fen-til"))
    );
    expect(guidance?.targetLocationId).toBe("location.mossroad");
    expect(guidance?.message ?? "").toContain("Fen Til");
  });

  it("says so plainly once the party is standing with the recipient", () => {
    const guidance = getObjectiveGuidance(
      snapshotWith("location.mossroad", withRecipient("deliver", "item.lantern-wick", "npc.fen-til"))
    );
    expect(guidance?.local).toBe(true);
    expect(guidance?.message ?? "").toContain("Hand it to Fen Til");
  });

  it("points a survive objective at the place the encounter is fought", () => {
    const guidance = getObjectiveGuidance(
      snapshotWith("location.hearthcross", activeQuest("survive", "encounter.ashfall-motes"))
    );
    expect(guidance?.targetLocationId).toBe("location.ashfall-trail");
  });

  it("leaves no authored objective kind without guidance", () => {
    const kinds = new Set(quests.flatMap((quest) => quest.steps.map(({ kind }) => kind)));
    for (const kind of kinds) {
      const step = quests.flatMap((quest) => quest.steps).find((entry) => entry.kind === kind)!;
      const guidance = getObjectiveGuidance(
        snapshotWith("location.hearthcross", withRecipient(kind, step.targetId, step.recipientId))
      );
      expect(guidance, `${kind} objectives give the player nothing`).toBeDefined();
    }
  });
});

