/**
 * The in-game help text. Authored as content rather than hardcoded in a scene,
 * so the game can explain itself without the presentation layer owning any
 * rules knowledge.
 *
 * Every entry here describes something the engine actually does. When a rule
 * changes, this file is part of the change.
 */
export interface CodexEntry {
  readonly id: string;
  readonly title: string;
  /** One screen of prose. Kept short enough to read without scrolling. */
  readonly body: string;
}

export interface CodexSection {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly CodexEntry[];
}

export const codexSections: readonly CodexSection[] = [
  {
    id: "codex.basics",
    title: "The Road",
    entries: [
      {
        id: "codex.movement",
        title: "Travelling",
        body: "Walk to the edge of a map to cross into the next place. Roads run both ways, so nowhere you can reach is a place you cannot leave. Time passes as you travel, and the chronicle records where you have been."
      },
      {
        id: "codex.talking",
        title: "Speaking with people",
        body: "Stand beside someone and confirm to talk. Most quests begin in conversation, and the journal names the person you should find next. People remember how you have treated them, and their faction remembers too."
      },
      {
        id: "codex.saving",
        title: "Keeping your chronicle",
        body: "The game saves itself as you travel, fight and trade. Quick Save writes to its own slot so it can never overwrite a chronicle you deliberately parked, and Quick Load brings it back. Three manual slots are yours to arrange."
      }
    ]
  },
  {
    id: "codex.combat",
    title: "Battle",
    entries: [
      {
        id: "codex.turns",
        title: "Taking turns",
        body: "Every living combatant acts once per round. Agility decides who moves first, and haste or slow will change that order while they last. When your whole party has acted, the enemies answer."
      },
      {
        id: "codex.targeting",
        title: "Choosing a target",
        body: "You may aim at any living enemy rather than always striking the first. Your choice is remembered, so repeating an attack needs no re-aiming, and it moves on by itself when that enemy falls. Healing forms and restoratives aim at your own party instead."
      },
      {
        id: "codex.guarding",
        title: "Guarding",
        body: "Guarding halves the harm of the next blow that lands on you, and is spent by that blow. It costs your turn, which makes it a trade rather than a free defence."
      },
      {
        id: "codex.escape",
        title: "Leaving a fight",
        body: "Ordinary encounters can be escaped. Named foes cannot, and the game will not offer you the choice — refusing to flee costs you nothing."
      },
      {
        id: "codex.elements",
        title: "Elements",
        body: "Every form carries an element, and every foe answers each element differently. You learn what a creature resists by striking it with that element; what you learn is remembered for its whole kind, and shown beside it from then on."
      },
      {
        id: "codex.statuses",
        title: "Lingering conditions",
        body: "Poison, burn and bleed drain vitality each round. Stun, sleep and freeze stop a combatant acting — but damage wakes a sleeper, which the other two survive. Weaken and fortify change what a blow is worth; haste and slow change when it lands. Named foes resist being silenced, so a lock is never certain."
      },
      {
        id: "codex.mp",
        title: "Spending focus",
        body: "Forms cost focus, shown beside each one. A form you cannot afford is dimmed rather than hidden, so you can see what waits for you. Focus returns with rest and with the right restoratives."
      }
    ]
  },
  {
    id: "codex.growth",
    title: "Growing",
    entries: [
      {
        id: "codex.levels",
        title: "Levels",
        body: "Experience comes from battle and from finished quests. Foes do not grow with you: each encounter is pitched at an authored strength, so levelling is a real and lasting advantage, and arriving somewhere too early is a difficulty you can answer by going elsewhere first."
      },
      {
        id: "codex.jobs",
        title: "Callings and branches",
        body: "Your calling decides which forms you learn. At level four a branch opens, granting a form no other path teaches. Gear is banded between martial and scholarly callings, so what you can wear follows who you have become."
      },
      {
        id: "codex.party",
        title: "Companions",
        body: "Four may walk at your side. Anyone else who joins waits in reserve, and you may exchange them freely outside battle — nobody who joins you is ever turned away or lost."
      }
    ]
  },
  {
    id: "codex.world",
    title: "The Chronicle",
    entries: [
      {
        id: "codex.quests",
        title: "Errands and obligations",
        body: "Quests ask you to speak, to travel, to gather, to deliver, to defeat, or simply to endure. The journal always names the next step. Some open only once the world has changed in a particular way."
      },
      {
        id: "codex.failure",
        title: "When a thread is lost",
        body: "A few obligations can be lost — by choosing otherwise, or by letting the world move first. None of them end the chronicle. When a thread is lost, another opens in its place."
      },
      {
        id: "codex.consequence",
        title: "Choices that close doors",
        body: "Some decisions cannot be walked back. The game warns you plainly before those, and asks a second time. Everything else can be reconsidered."
      },
      {
        id: "codex.postgame",
        title: "After the ending",
        body: "The chronicle stays open once the last covenant is settled. An older thing waits in the Starless Vault for a party that has finished everything else. Beginning again carries your levels, your gear and your coin into a road you already know."
      }
    ]
  }
];

export const codexEntryCount = codexSections.reduce(
  (total, section) => total + section.entries.length,
  0
);
