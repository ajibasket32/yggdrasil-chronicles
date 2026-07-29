import type { EntityId, ItemDefinition, PlayerCharacter, Stats } from "../shared/types";

export type EquipmentSlot = keyof PlayerCharacter["equipment"];

export interface EquipmentItemDefinition extends ItemDefinition {
  readonly kind: EquipmentSlot;
  readonly statModifiers: Readonly<Partial<Stats>>;
  readonly minimumLevel?: number;
  readonly allowedJobIds?: readonly EntityId[];
}

export type EquipmentCatalog = Readonly<Record<EntityId, EquipmentItemDefinition>>;

export type EquipmentEligibilityReason = "minimum_level" | "job_restriction";

export interface EquipmentEligibility {
  readonly canEquip: boolean;
  readonly reason?: EquipmentEligibilityReason;
}

const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ["weapon", "armor", "accessory"];

const STAT_KEYS: readonly (keyof Stats)[] = [
  "maxHp",
  "maxMp",
  "strength",
  "dexterity",
  "agility",
  "vitality",
  "intellect",
  "wisdom",
  "charisma"
];

const MINIMUM_STATS: Readonly<Stats> = {
  maxHp: 1,
  maxMp: 0,
  strength: 0,
  dexterity: 0,
  agility: 0,
  vitality: 0,
  intellect: 0,
  wisdom: 0,
  charisma: 0
};

function isEquipmentSlot(value: string): value is EquipmentSlot {
  return EQUIPMENT_SLOTS.includes(value as EquipmentSlot);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Reject malformed equipment content before it can alter canonical game state.
 * Modifiers are signed integers so content can express equipment tradeoffs.
 */
export function assertValidEquipmentDefinition(item: EquipmentItemDefinition): void {
  if (!item.id.trim()) {
    throw new Error("Equipment item IDs must not be empty");
  }
  if (!isEquipmentSlot(item.kind)) {
    throw new Error(`Item '${item.id}' is not an equipable item`);
  }
  if (!Number.isInteger(item.value) || item.value < 0) {
    throw new RangeError(`Equipment item '${item.id}' must have a non-negative integer value`);
  }
  if (item.minimumLevel !== undefined && (!Number.isInteger(item.minimumLevel) || item.minimumLevel < 1)) {
    throw new RangeError(`Equipment item '${item.id}' has an invalid minimum level`);
  }

  const modifiers = item.statModifiers as Readonly<Record<string, unknown>>;
  const modifierKeys = Object.keys(modifiers);
  if (modifierKeys.length === 0) {
    throw new Error(`Equipment item '${item.id}' must define at least one stat modifier`);
  }
  for (const key of modifierKeys) {
    if (!STAT_KEYS.includes(key as keyof Stats)) {
      throw new Error(`Equipment item '${item.id}' modifies unknown stat '${key}'`);
    }
    if (!Number.isInteger(modifiers[key])) {
      throw new RangeError(`Equipment item '${item.id}' modifier '${key}' must be an integer`);
    }
  }

  if (item.allowedJobIds !== undefined) {
    if (item.allowedJobIds.some((jobId) => !jobId.trim())) {
      throw new Error(`Equipment item '${item.id}' has an empty job restriction`);
    }
    if (new Set(item.allowedJobIds).size !== item.allowedJobIds.length) {
      throw new Error(`Equipment item '${item.id}' has duplicate job restrictions`);
    }
  }
}

export function createEquipmentCatalog(items: readonly EquipmentItemDefinition[]): EquipmentCatalog {
  const catalog = Object.create(null) as Record<EntityId, EquipmentItemDefinition>;
  for (const item of items) {
    assertValidEquipmentDefinition(item);
    if (hasOwn(catalog, item.id)) {
      throw new Error(`Equipment catalog contains duplicate item '${item.id}'`);
    }
    catalog[item.id] = {
      ...item,
      statModifiers: { ...item.statModifiers },
      allowedJobIds: item.allowedJobIds === undefined ? undefined : [...item.allowedJobIds]
    };
  }
  return catalog;
}

export function getEquipmentEligibility(
  character: PlayerCharacter,
  item: EquipmentItemDefinition
): EquipmentEligibility {
  assertValidEquipmentDefinition(item);
  if (item.minimumLevel !== undefined && character.level < item.minimumLevel) {
    return { canEquip: false, reason: "minimum_level" };
  }
  if (item.allowedJobIds !== undefined && !item.allowedJobIds.includes(character.jobId)) {
    return { canEquip: false, reason: "job_restriction" };
  }
  return { canEquip: true };
}

export function canEquipItem(character: PlayerCharacter, item: EquipmentItemDefinition): boolean {
  return getEquipmentEligibility(character, item).canEquip;
}

export function equipItem(character: PlayerCharacter, item: EquipmentItemDefinition): PlayerCharacter {
  const eligibility = getEquipmentEligibility(character, item);
  if (!eligibility.canEquip) {
    throw new Error(`Character '${character.id}' cannot equip '${item.id}': ${eligibility.reason}`);
  }
  return {
    ...character,
    equipment: { ...character.equipment, [item.kind]: item.id }
  };
}

export function unequipItem(character: PlayerCharacter, slot: EquipmentSlot): PlayerCharacter {
  const equipment = { ...character.equipment };
  delete equipment[slot];
  return { ...character, equipment };
}

function getEquippedItem(
  slot: EquipmentSlot,
  itemId: EntityId,
  catalog: EquipmentCatalog
): EquipmentItemDefinition {
  const item = catalog[itemId];
  if (!item) {
    throw new Error(`Equipment catalog does not contain '${itemId}'`);
  }
  assertValidEquipmentDefinition(item);
  if (item.kind !== slot) {
    throw new Error(`Equipment item '${itemId}' cannot occupy '${slot}'`);
  }
  return item;
}

/** Applies equipped item modifiers while preserving the supplied base stats. */
export function deriveEquipmentStats(
  baseStats: Stats,
  equipment: PlayerCharacter["equipment"],
  catalog: EquipmentCatalog
): Stats {
  const derived: Stats = { ...baseStats };
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = equipment[slot];
    if (itemId === undefined) {
      continue;
    }
    const item = getEquippedItem(slot, itemId, catalog);
    for (const key of STAT_KEYS) {
      const modifier = item.statModifiers[key] ?? 0;
      derived[key] = Math.max(MINIMUM_STATS[key], derived[key] + modifier);
    }
  }
  return derived;
}

/** Derives the stats that a player's combatant should receive at battle start. */
export function deriveCharacterCombatStats(character: PlayerCharacter, catalog: EquipmentCatalog): Stats {
  return deriveEquipmentStats(character.stats, character.equipment, catalog);
}
