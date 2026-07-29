import { describe, expect, it } from "vitest";
import {
  assertValidEquipmentDefinition,
  canEquipItem,
  createEquipmentCatalog,
  deriveCharacterCombatStats,
  deriveEquipmentStats,
  equipItem,
  getEquipmentEligibility,
  unequipItem,
  type EquipmentItemDefinition
} from "../../src/engine/equipment";
import { makePlayerCharacter } from "./fixtures";

const wayfarerBlade: EquipmentItemDefinition = {
  id: "item.wayfarer-blade",
  name: "Wayfarer Blade",
  kind: "weapon",
  description: "A balanced road sword.",
  value: 120,
  statModifiers: { strength: 4, dexterity: 1 }
};

const resinVest: EquipmentItemDefinition = {
  id: "item.resin-vest",
  name: "Resin Vest",
  kind: "armor",
  description: "Flexible layered resin.",
  value: 110,
  statModifiers: { maxHp: 18, vitality: 3, agility: -1 },
  minimumLevel: 2,
  allowedJobIds: ["job-vanguard"]
};

describe("equipment rules", () => {
  it("equips into the definition's explicit slot without mutating the character", () => {
    const character = makePlayerCharacter();
    const equipped = equipItem(character, wayfarerBlade);

    expect(equipped.equipment).toEqual({ weapon: wayfarerBlade.id });
    expect(character.equipment).toEqual({});
    expect(equipped).not.toBe(character);
  });

  it("replaces only the occupied slot and unequips immutably", () => {
    const character = { ...makePlayerCharacter(), equipment: { weapon: "item.old-blade", accessory: "item.charm" } };
    const equipped = equipItem(character, wayfarerBlade);
    const unequipped = unequipItem(equipped, "weapon");

    expect(equipped.equipment).toEqual({ weapon: wayfarerBlade.id, accessory: "item.charm" });
    expect(unequipped.equipment).toEqual({ accessory: "item.charm" });
    expect(equipped.equipment.weapon).toBe(wayfarerBlade.id);
  });

  it("reports deterministic level and job restrictions before refusing an equip", () => {
    const tooLow = makePlayerCharacter();
    const wrongJob = { ...makePlayerCharacter(), level: 2, jobId: "job-ranger" };

    expect(getEquipmentEligibility(tooLow, resinVest)).toEqual({ canEquip: false, reason: "minimum_level" });
    expect(getEquipmentEligibility(wrongJob, resinVest)).toEqual({ canEquip: false, reason: "job_restriction" });
    expect(canEquipItem(wrongJob, resinVest)).toBe(false);
    expect(() => equipItem(tooLow, resinVest)).toThrow(/minimum_level/);
  });

  it("derives signed equipment tradeoffs without modifying base stats", () => {
    const character = { ...makePlayerCharacter(), level: 2 };
    const equipped = equipItem(equipItem(character, wayfarerBlade), resinVest);
    const catalog = createEquipmentCatalog([wayfarerBlade, resinVest]);
    const derived = deriveCharacterCombatStats(equipped, catalog);

    expect(derived).toMatchObject({
      maxHp: character.stats.maxHp + 18,
      strength: character.stats.strength + 4,
      dexterity: character.stats.dexterity + 1,
      vitality: character.stats.vitality + 3,
      agility: character.stats.agility - 1
    });
    expect(equipped.stats).toEqual(character.stats);
  });

  it("clamps derived stats at combat-safe minima", () => {
    const burden: EquipmentItemDefinition = {
      id: "item.lead-band",
      name: "Lead Band",
      kind: "accessory",
      description: "A punishing training weight.",
      value: 1,
      statModifiers: { maxHp: -999, maxMp: -999, strength: -999 }
    };
    const stats = deriveEquipmentStats(
      makePlayerCharacter().stats,
      { accessory: burden.id },
      createEquipmentCatalog([burden])
    );

    expect(stats.maxHp).toBe(1);
    expect(stats.maxMp).toBe(0);
    expect(stats.strength).toBe(0);
  });

  it("rejects malformed content and mismatched save references", () => {
    const malformed = { ...wayfarerBlade, statModifiers: { luck: 3 } } as unknown as EquipmentItemDefinition;
    expect(() => assertValidEquipmentDefinition(malformed)).toThrow(/unknown stat/);
    expect(() => createEquipmentCatalog([wayfarerBlade, wayfarerBlade])).toThrow(/duplicate item/);
    expect(() => deriveEquipmentStats(
      makePlayerCharacter().stats,
      { armor: wayfarerBlade.id },
      createEquipmentCatalog([wayfarerBlade])
    )).toThrow(/cannot occupy/);
    expect(() => deriveEquipmentStats(
      makePlayerCharacter().stats,
      { weapon: "item.missing" },
      createEquipmentCatalog([wayfarerBlade])
    )).toThrow(/does not contain/);
  });
});
