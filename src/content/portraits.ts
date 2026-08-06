/**
 * Faces for the people who talk to you — stage two.
 *
 * Stage one crop-faced the walk-cycle sheets because no portrait art with
 * verified provenance existed. It does now: EverFace (Efilheim, CC0, the same
 * author as the EverRogue tileset already in ASSETS.md) ships eighteen 24×24
 * pixel portraits in exactly this game's style. Each speaker tag maps to a
 * face and a subtle faction wash; faces may repeat across towns, but every
 * tag's face-and-wash pair is unique, which `tests/content/portraits.test.ts`
 * enforces.
 *
 * The mapping stayed data, which is why this upgrade touched no scene code:
 * swapping crop-faces for portraits was exactly the texture swap the stage-one
 * header promised.
 */
export interface PortraitAppearance {
  /** A texture key BootScene loads. */
  readonly spriteKey: string;
  /** Frame within the sheet: EverFace is one row of eighteen 24px faces. */
  readonly frame: number;
  /** Multiplied over the sprite; kept near-white so the art keeps its own colours. */
  readonly tint: number;
}

export const PORTRAIT_SHEET = "portraits.everface";
export const PORTRAIT_FRAME_COUNT = 18;
export const PORTRAIT_SOURCE_SIZE = 24;

/**
 * Subtle faction washes: enough to tell two bearers of one face apart and to
 * echo faction palettes, gentle enough not to discolour skin tones.
 */
const WASH = {
  plain: 0xffffff,
  warden: 0xd8f0dc,
  compact: 0xf2e0c4,
  archive: 0xd8e6f6,
  choir: 0xe6daf2,
  freebound: 0xf6e8c8,
  ashen: 0xc9d2d6
} as const;

const face = (frame: number, tint: number): PortraitAppearance => ({
  spriteKey: PORTRAIT_SHEET,
  frame,
  tint
});

const PORTRAITS: Readonly<Record<string, PortraitAppearance>> = {
  // Hearthcross
  "portrait.warden": face(10, WASH.warden),
  "portrait.scout": face(2, WASH.freebound),
  "portrait.grower": face(3, WASH.plain),
  "portrait.scholar": face(9, WASH.archive),
  "portrait.innkeeper": face(6, WASH.plain),
  "portrait.medic": face(5, WASH.warden),
  // Mossroad
  "portrait.guide": face(6, WASH.freebound),
  "portrait.salvager": face(12, WASH.compact),
  "portrait.bard": face(7, WASH.plain),
  // Hollow Root
  "portrait.listener": face(8, WASH.choir),
  // Emberwake
  "portrait.factor": face(8, WASH.compact),
  "portrait.smith": face(11, WASH.plain),
  "portrait.delver": face(12, WASH.freebound),
  "portrait.artisan": face(3, WASH.compact),
  "portrait.keeper": face(4, WASH.warden),
  "portrait.investigator": face(10, WASH.archive),
  // Ashfall Trail
  "portrait.cook": face(13, WASH.freebound),
  "portrait.captain": face(1, WASH.plain),
  "portrait.pilgrim": face(4, WASH.choir),
  // Silent Kiln — the one genuinely ghostly face for the kiln-bound memory.
  "portrait.echo": face(17, WASH.ashen),
  // Larkspire
  "portrait.astronomer": face(15, WASH.archive),
  "portrait.bridgekeeper": face(16, WASH.warden),
  "portrait.conservator": face(9, WASH.plain),
  "portrait.apothecary": face(15, WASH.plain),
  "portrait.climber": face(16, WASH.freebound),
  // Whitebough
  "portrait.cantor": face(7, WASH.choir),
  "portrait.envoy": face(14, WASH.compact),
  "portrait.courier": face(2, WASH.ashen),
  // Starless Vault
  "portrait.custodian": face(13, WASH.archive),
  "portrait.architect": face(0, WASH.choir)
};

export function portraitAppearance(tag: string | undefined): PortraitAppearance | undefined {
  return tag ? PORTRAITS[tag] : undefined;
}

/** Every tag this module answers for, so content validation can prove none is orphaned. */
export function knownPortraitTags(): readonly string[] {
  return Object.keys(PORTRAITS);
}
