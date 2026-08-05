/**
 * Faces for the people who talk to you.
 *
 * Every NPC has carried an `assetTag` like `portrait.warden` since the campaign
 * was authored — thirty of them — and not one reached any code. Dialogue was
 * delivered by a single gold label, so the reeve of Hearthcross and the
 * severance architect who ends the world looked exactly alike.
 *
 * There is no portrait art in the repository and ASSETS.md forbids inventing
 * some, so this maps each tag onto the committed CC0 character sheets the game
 * already loads: a sheet, a frame, and a tint. That is not painted portrait art,
 * but it is a *specific face per speaker* drawn from assets whose provenance is
 * verified — the honest version of this feature until real portraits clear
 * licensing.
 *
 * The mapping is data on purpose. Swapping in real portraits later means
 * changing `spriteKey` here, not touching a scene.
 */
export interface PortraitAppearance {
  /** A texture key BootScene loads. */
  readonly spriteKey: string;
  /** Frame within the sheet. These are 24×8 grids of 32px frames; 0 is the idle pose. */
  readonly frame: number;
  /** Multiplied over the sprite so speakers sharing a sheet still read apart. */
  readonly tint: number;
}

/** Only sheets BootScene actually loads. A key that is not loaded draws nothing. */
const SHEET = {
  vanguard: "sprite.job.vanguard",
  warden: "sprite.job.warden",
  ranger: "sprite.job.ranger",
  trickster: "sprite.job.trickster",
  mender: "sprite.job.mender",
  shaper: "sprite.job.shaper",
  soldier: "sprite.enemy.humanoid",
  plainfolk: "sprite.enemy.boss"
} as const;

/**
 * Faction-legible tints against the dialogue panel: green for the Rootwardens,
 * brass for the Compact, cool blue for the Lantern Archive, violet for the
 * Quiet Choir, amber for the Freebound, and two neutrals.
 */
const TINT = {
  warden: 0x8fc79a,
  compact: 0xd8a45c,
  archive: 0x9db8dd,
  choir: 0xc0a8d6,
  freebound: 0xe6c07a,
  plain: 0xe8dcc0,
  ashen: 0xa9b0b8
} as const;

const face = (spriteKey: string, tint: number, frame = 0): PortraitAppearance => ({
  spriteKey,
  frame,
  tint
});

const PORTRAITS: Readonly<Record<string, PortraitAppearance>> = {
  // Hearthcross
  "portrait.warden": face(SHEET.warden, TINT.warden),
  "portrait.scout": face(SHEET.ranger, TINT.freebound),
  "portrait.grower": face(SHEET.plainfolk, TINT.plain),
  "portrait.scholar": face(SHEET.mender, TINT.archive),
  "portrait.innkeeper": face(SHEET.soldier, TINT.plain),
  "portrait.medic": face(SHEET.mender, TINT.warden),
  // Mossroad
  "portrait.guide": face(SHEET.ranger, TINT.freebound, 24),
  "portrait.salvager": face(SHEET.trickster, TINT.compact),
  "portrait.bard": face(SHEET.trickster, TINT.plain),
  // Hollow Root
  "portrait.listener": face(SHEET.shaper, TINT.choir),
  // Emberwake
  "portrait.factor": face(SHEET.soldier, TINT.compact),
  "portrait.smith": face(SHEET.vanguard, TINT.plain),
  "portrait.delver": face(SHEET.warden, TINT.freebound),
  "portrait.artisan": face(SHEET.plainfolk, TINT.compact),
  "portrait.keeper": face(SHEET.shaper, TINT.warden),
  "portrait.investigator": face(SHEET.trickster, TINT.archive),
  // Ashfall Trail
  "portrait.cook": face(SHEET.plainfolk, TINT.freebound),
  "portrait.captain": face(SHEET.vanguard, TINT.compact),
  "portrait.pilgrim": face(SHEET.plainfolk, TINT.choir),
  // Silent Kiln
  "portrait.echo": face(SHEET.plainfolk, TINT.ashen),
  // Larkspire
  "portrait.astronomer": face(SHEET.mender, TINT.choir),
  "portrait.bridgekeeper": face(SHEET.ranger, TINT.warden),
  "portrait.conservator": face(SHEET.shaper, TINT.archive),
  "portrait.apothecary": face(SHEET.trickster, TINT.warden),
  "portrait.climber": face(SHEET.ranger, TINT.plain),
  // Whitebough
  "portrait.cantor": face(SHEET.mender, TINT.plain),
  "portrait.envoy": face(SHEET.soldier, TINT.archive),
  "portrait.courier": face(SHEET.ranger, TINT.ashen),
  // Starless Vault
  "portrait.custodian": face(SHEET.shaper, TINT.ashen),
  "portrait.architect": face(SHEET.vanguard, TINT.choir)
};

export function portraitAppearance(tag: string | undefined): PortraitAppearance | undefined {
  return tag ? PORTRAITS[tag] : undefined;
}

/** Every tag this module answers for, so content validation can prove none is orphaned. */
export function knownPortraitTags(): readonly string[] {
  return Object.keys(PORTRAITS);
}
