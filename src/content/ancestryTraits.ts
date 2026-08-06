import type { TraitId } from "../shared/types";

/**
 * One innate trait per ancestry — the mechanic behind the words.
 *
 * Character creation has always advertised each ancestry with a line like
 * "Reliable recovery" or "Guard durability", but the words changed nothing:
 * ancestry was a stat delta and a sprite tint, so the 4×6 creation grid was
 * really six builds wearing four coats. Each trait below implements exactly
 * the identity its ancestry's authored text already claims.
 *
 * The engine applies these by id (see `combat.ts`); this file owns which
 * ancestry carries which, and the words the UI shows. Traits ride on battle
 * combatants only — they derive from `raceId` at battle assembly and are
 * never persisted, so no save migration is involved.
 */
export interface AncestryTrait {
  readonly id: TraitId;
  readonly ancestryId: string;
  readonly name: string;
  /** One sentence, shown at character creation and in the party screen. */
  readonly description: string;
}

export const ancestryTraits: readonly AncestryTrait[] = [
  {
    id: "trait.hearthfire",
    ancestryId: "hearthborn",
    name: "Hearthfire",
    description: "Mending goes further: healing received is a fifth stronger."
  },
  {
    id: "trait.rootspeaker",
    ancestryId: "sylvan",
    name: "Rootspeaker",
    description: "Poisons, burns and bindings lose a round of their hold."
  },
  {
    id: "trait.stoneguard",
    ancestryId: "stonekin",
    name: "Stoneguard",
    description: "Guarding plants like stone: blocked harm is reduced further."
  },
  {
    id: "trait.wayfinder",
    ancestryId: "wayfarer",
    name: "Wayfinder",
    description: "Always a step ahead: acts earlier in the turn order."
  }
];

export function traitForAncestry(ancestryId: string): AncestryTrait | undefined {
  return ancestryTraits.find((trait) => trait.ancestryId === ancestryId);
}

export function traitIdsForAncestry(ancestryId: string): readonly TraitId[] {
  const trait = traitForAncestry(ancestryId);
  return trait ? [trait.id] : [];
}
