/**
 * Scripted scenes: authored story beats that play on their own rather than
 * being read out of an NPC's rotating small talk.
 *
 * The game had no structure for this at all — `DialogueCatalog` is a flat
 * `Record<string, string[]>`, so there was no way to stage an opening, a boss
 * introduction, or a companion speaking up on the road. Everything the player
 * heard was triggered by walking up to someone and pressing a key.
 *
 * A scene is deliberately a list of lines with a speaker and an optional
 * portrait tag, not a mini-language. It carries no branching, no conditions
 * beyond its trigger, and no effects: anything that changes the world stays in
 * the quest and consequence systems where it can be validated.
 */
export interface SceneLine {
  /** Display name. Empty for narration, which the presentation layer styles differently. */
  readonly speaker: string;
  readonly text: string;
  /** Matches an NPC's `assetTag` when a portrait exists for the speaker. */
  readonly portraitTag?: string;
}

export type SceneTrigger =
  /** Plays once, the first time the world scene opens on a new chronicle. */
  | { readonly kind: "campaign_start" }
  /** Plays when a named encounter begins, before the first turn. */
  | { readonly kind: "encounter_start"; readonly encounterId: string }
  /** Plays on arriving at a location, the first time only. */
  | { readonly kind: "location_first_visit"; readonly locationId: string }
  /** Plays when a named quest completes. */
  | { readonly kind: "quest_completed"; readonly questId: string };

export interface SceneDefinition {
  readonly id: string;
  readonly trigger: SceneTrigger;
  readonly lines: readonly SceneLine[];
  /**
   * Scenes are once-only by default: the flag that records having seen one is
   * derived from its id, so replaying a chronicle replays its scenes.
   */
  readonly repeatable?: boolean;
}

export const scenes: readonly SceneDefinition[] = [
  {
    id: "scene.prologue",
    trigger: { kind: "campaign_start" },
    lines: [
      { speaker: "", text: "Rain has been falling on Hearthcross for nine days. The orchards do not mind. The roads do." },
      { speaker: "", text: "Beneath the mud, a rootway runs east toward the Mossroad — one of the living lines that carry word, water and memory between the settlements of the Verdant Reach." },
      { speaker: "", text: "Three nights ago it stopped singing." },
      { speaker: "Mara Vell", text: "You came faster than the Compact's factor did. I will remember that.", portraitTag: "portrait.warden" },
      { speaker: "Mara Vell", text: "The east line is quiet. Not damaged — quiet. There is a difference, and the difference is what frightens me.", portraitTag: "portrait.warden" },
      { speaker: "Mara Vell", text: "Walk the orchard road. Ask Orren what his charts say. And do not tell anyone yet that a rootway can be silenced on purpose.", portraitTag: "portrait.warden" },
      { speaker: "", text: "The chronicle begins." }
    ]
  },
  {
    id: "scene.mire-antler-intro",
    trigger: { kind: "encounter_start", encounterId: "encounter.mire-antler" },
    lines: [
      { speaker: "", text: "The flooded hollow goes still. Even the rain seems to hesitate." },
      { speaker: "", text: "Something antlered rises out of the water — too tall, too patient, and carrying the smell of a road that drowned." },
      { speaker: "Old Cairn", text: "It follows fear. Fear leaves such bright tracks in flooded earth.", portraitTag: "portrait.listener" }
    ]
  },
  {
    id: "scene.kiln-heart-intro",
    trigger: { kind: "encounter_start", encounterId: "encounter.kiln-heart" },
    lines: [
      { speaker: "", text: "The Silent Kiln is not silent. It has simply been holding its breath since the day its workers stopped counting." },
      { speaker: "", text: "White fire moves behind the sealed vents, patient as a ledger." },
      { speaker: "", text: "Something in there remembers being useful." }
    ]
  },
  {
    id: "scene.varn-intro",
    trigger: { kind: "encounter_start", encounterId: "encounter.varn-rootless" },
    lines: [
      { speaker: "Varn", text: "You have walked a long way to arrive at a disagreement." },
      { speaker: "Varn", text: "I cut the lines because memory is a debt, and the Reach could not pay it. You would have the tree remember every cruelty forever." },
      { speaker: "Varn", text: "One of us is going to be wrong in front of witnesses. Let us find out which." }
    ]
  },
  {
    id: "scene.hollow-root-arrival",
    trigger: { kind: "location_first_visit", locationId: "location.hollow-root" },
    lines: [
      { speaker: "", text: "The descent smells of wet cedar and iron filings. Water drips in seven rhythms." },
      { speaker: "", text: "The eighth rhythm belongs to something that no longer has a name." }
    ]
  },
  {
    id: "scene.emberwake-arrival",
    trigger: { kind: "location_first_visit", locationId: "location.emberwake" },
    lines: [
      { speaker: "", text: "Emberwake works in shifts, and the sky above it has not been properly dark in a generation." },
      { speaker: "", text: "Basalt, brass, and the low constant sound of something being refined out of something else." },
      { speaker: "", text: "Between shift bells, delvers trade road-lore for news: how to steep, bind and temper what a pack already carries. The party listens well. Trail remedies can now be worked from the system menu." }
    ]
  },
  {
    id: "scene.larkspire-arrival",
    trigger: { kind: "location_first_visit", locationId: "location.larkspire" },
    lines: [
      { speaker: "", text: "Larkspire is built in the branches of a white forest, above a city nobody living has walked." },
      { speaker: "", text: "The astronomers here keep charts of stars that the charts themselves insist do not exist." }
    ]
  },

  // Companions speaking in their own voice once their thread resolves — the
  // road otherwise never hears from the people walking it.
  {
    id: "scene.tovin-joins-the-road",
    trigger: { kind: "quest_completed", questId: "quest.tovins-company" },
    lines: [
      { speaker: "Tovin Ash", text: "So that is what became of them. I carried that question for two winters; it is lighter as an answer, even a hard one.", portraitTag: "portrait.scout" },
      { speaker: "Tovin Ash", text: "You will want a second blade on the road ahead. Come find me when you are ready to walk.", portraitTag: "portrait.scout" }
    ]
  },
  {
    id: "scene.keva-oath-returned",
    trigger: { kind: "quest_completed", questId: "quest.kevas-last-descent" },
    lines: [
      { speaker: "Keva Dross", text: "A delver's token goes back to the dark it came from. That is the whole of the oath, and you kept it for a stranger.", portraitTag: "portrait.delver" },
      { speaker: "Keva Dross", text: "The kiln tunnels reach further than the maps admit. If you mean to walk them, I mean to be in front of you.", portraitTag: "portrait.delver" }
    ]
  },
  {
    id: "scene.eira-leaves-the-bridge",
    trigger: { kind: "quest_completed", questId: "quest.eiras-burden" },
    lines: [
      { speaker: "Eira Lune", text: "I told myself the bridge could not stand a day without me. Thea will mind it better than my worry ever did.", portraitTag: "portrait.bridgekeeper" },
      { speaker: "Eira Lune", text: "There are people out there hurt worse than bridges. Take me with you and I will mend what I can reach.", portraitTag: "portrait.bridgekeeper" }
    ]
  },
  {
    id: "scene.silent-kiln-named",
    trigger: { kind: "quest_completed", questId: "quest.silent-kiln" },
    lines: [
      { speaker: "", text: "The kiln's ledger closes on a name that was never meant to survive its own erasure." },
      { speaker: "", text: "Somewhere east, in a vault without stars, something that erases names for a living takes notice." }
    ]
  }
];

export function sceneFlagFor(sceneId: string): string {
  return `progress.scene.${sceneId}`;
}

export function scenesForTrigger(
  predicate: (trigger: SceneTrigger) => boolean
): readonly SceneDefinition[] {
  return scenes.filter((scene) => predicate(scene.trigger));
}
