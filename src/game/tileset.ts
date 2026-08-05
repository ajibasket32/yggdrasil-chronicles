/**
 * Terrain drawn from the committed tilesets instead of generated colour squares.
 *
 * `punyworld-overworld.png` and `everrogue-tileset.png` have been in the
 * repository with verified CC0 provenance since the asset catalog was written,
 * and no code referenced either of them. The world was four `generateTexture`
 * squares — grass, water, stone, dungeon — tinted per region. That is
 * programmer art standing in for the one thing a 16-bit JRPG is recognised by.
 *
 * Tile choices live here as data, and the coordinates are the ones actually
 * verified against the sheets, not guesses: every entry below was picked by
 * decoding the PNG and checking the tile is the flat terrain it claims to be.
 * Frame numbers are derived, never hardcoded, so a different sheet layout means
 * changing one constant.
 */

export const OVERWORLD_SHEET = "tiles.overworld";
export const DUNGEON_SHEET = "tiles.dungeon";

/** Source tiles are 16px; the world renders them at 32px. */
export const SOURCE_TILE = 16;

/** 432px / 16px. */
export const OVERWORLD_COLUMNS = 27;
/** 256px / 16px. */
export const DUNGEON_COLUMNS = 16;

export interface TileRef {
  readonly sheet: string;
  readonly frame: number;
}

function overworld(column: number, row: number): TileRef {
  return { sheet: OVERWORLD_SHEET, frame: row * OVERWORLD_COLUMNS + column };
}

function dungeon(column: number, row: number): TileRef {
  return { sheet: DUNGEON_SHEET, frame: row * DUNGEON_COLUMNS + column };
}

/**
 * Nine interchangeable grass tiles. Using one would tile visibly; the variants
 * carry the flowers and tufts that make a field read as a field.
 */
export const GRASS_TILES: readonly TileRef[] = [
  overworld(0, 0), overworld(1, 0), overworld(2, 0),
  overworld(0, 1), overworld(1, 1), overworld(2, 1),
  overworld(0, 2), overworld(1, 2), overworld(2, 2)
];

export const DIRT_TILE = overworld(8, 1);
export const SHALLOW_WATER_TILE = overworld(8, 11);
export const DEEP_WATER_TILE = overworld(23, 11);

/** Free-standing trees on transparent backgrounds, drawn over grass. */
export const TREE_TILES: readonly TileRef[] = [overworld(8, 7), overworld(8, 8), overworld(8, 9)];

/**
 * Cavern floor. Deliberately one flat tile: the roguelike sheet has no floor
 * textures, only line art on a solid ground colour, and its speckled tiles are
 * scattered gold dust — as a floor they read as confetti, not stone.
 */
export const DUNGEON_FLOOR_TILE = dungeon(4, 14);
/** Worked stone, for the wall band framing a room. */
export const DUNGEON_WALL_TILE = dungeon(5, 4);

/**
 * A stable pseudo-random index for a map cell.
 *
 * Deterministic on purpose: the same tile must appear in the same place every
 * time a location is drawn, or walking out of a room and back would reshuffle
 * the ground under the player. This is presentation only and never touches the
 * seeded RNG the engine uses for rules.
 */
export function tileVariant(column: number, row: number, count: number): number {
  if (count <= 1) return 0;
  const hashed = Math.imul(column * 73_856_093 ^ row * 19_349_663, 0x45d9f3b);
  return Math.abs(hashed >>> 8) % count;
}

export type TerrainKind = "town" | "wilderness" | "dungeon";

/**
 * The wilderness track, as ground rather than a line drawn over it.
 *
 * `paintLandmarks` has always stroked a road across these maps; the ground
 * underneath stayed grass, so the road read as paint on a lawn. Matching the
 * same descent — west edge low, east edge higher — makes the track something
 * the party walks on.
 */
export function isRoadCell(column: number, row: number, columns: number): boolean {
  const across = columns <= 1 ? 0 : column / (columns - 1);
  return Math.abs(row - (10 - 3 * across)) <= 0.6;
}

/** The ground tile for one cell of a location's map. */
export function groundTile(
  kind: TerrainKind,
  column: number,
  row: number,
  columns: number,
  rows: number
): TileRef {
  const onEdge = column === 0 || row === 0 || column === columns - 1 || row === rows - 1;
  if (kind === "dungeon") return onEdge ? DUNGEON_WALL_TILE : DUNGEON_FLOOR_TILE;
  if (kind === "town" && onEdge) {
    // A moat of water framed the town before and still does; it is now water
    // that looks like water.
    const corner = (column === 0 || column === columns - 1) && (row === 0 || row === rows - 1);
    return corner ? DEEP_WATER_TILE : SHALLOW_WATER_TILE;
  }
  if (kind === "wilderness" && isRoadCell(column, row, columns)) return DIRT_TILE;
  const grass = GRASS_TILES[tileVariant(column, row, GRASS_TILES.length)];
  return grass ?? GRASS_TILES[0]!;
}

/**
 * Whether a cell should carry a tree drawn over its ground tile. Kept sparse and
 * away from the edges so it never sits on an exit or a spawn lane.
 */
export function treeAt(
  kind: TerrainKind,
  column: number,
  row: number,
  columns: number,
  rows: number
): TileRef | undefined {
  if (kind === "dungeon") return undefined;
  if (column < 2 || row < 2 || column > columns - 3 || row > rows - 3) return undefined;
  // Never on the track: a tree in the road reads as an obstacle the player
  // cannot walk around, and this map has no collision.
  if (kind === "wilderness" && isRoadCell(column, row, columns)) return undefined;
  const density = kind === "wilderness" ? 11 : 23;
  if (tileVariant(column + 7, row + 13, density) !== 0) return undefined;
  return TREE_TILES[tileVariant(column, row, TREE_TILES.length)];
}
