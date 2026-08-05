import { describe, expect, it } from "vitest";
import {
  DEEP_WATER_TILE,
  DIRT_TILE,
  DUNGEON_COLUMNS,
  DUNGEON_FLOOR_TILE,
  DUNGEON_SHEET,
  DUNGEON_WALL_TILE,
  GRASS_TILES,
  groundTile,
  isRoadCell,
  OVERWORLD_COLUMNS,
  OVERWORLD_SHEET,
  SHALLOW_WATER_TILE,
  tileVariant,
  treeAt,
  TREE_TILES
} from "../../src/game/tileset";

const COLUMNS = 23;
const ROWS = 17;

/** The committed sheets are 432x1040 and 256x240 at 16px tiles. */
const OVERWORLD_FRAMES = OVERWORLD_COLUMNS * (1040 / 16);
const DUNGEON_FRAMES = DUNGEON_COLUMNS * (240 / 16);

describe("tileset", () => {
  it("keeps every frame inside its sheet", () => {
    const overworld = [...GRASS_TILES, ...TREE_TILES, DIRT_TILE, SHALLOW_WATER_TILE, DEEP_WATER_TILE];
    for (const tile of overworld) {
      expect(tile.sheet).toBe(OVERWORLD_SHEET);
      expect(tile.frame).toBeGreaterThanOrEqual(0);
      expect(tile.frame).toBeLessThan(OVERWORLD_FRAMES);
    }
    for (const tile of [DUNGEON_FLOOR_TILE, DUNGEON_WALL_TILE]) {
      expect(tile.sheet).toBe(DUNGEON_SHEET);
      expect(tile.frame).toBeLessThan(DUNGEON_FRAMES);
    }
  });

  it("draws the same ground for a cell every time it is asked", () => {
    for (const kind of ["town", "wilderness", "dungeon"] as const) {
      for (let pass = 0; pass < 3; pass += 1) {
        expect(groundTile(kind, 9, 6, COLUMNS, ROWS)).toEqual(groundTile(kind, 9, 6, COLUMNS, ROWS));
      }
    }
  });

  it("frames a town with water and a dungeon with stone", () => {
    expect(groundTile("town", 0, 5, COLUMNS, ROWS)).toEqual(SHALLOW_WATER_TILE);
    expect(groundTile("town", 0, 0, COLUMNS, ROWS)).toEqual(DEEP_WATER_TILE);
    expect(groundTile("dungeon", 0, 5, COLUMNS, ROWS)).toEqual(DUNGEON_WALL_TILE);
    expect(groundTile("dungeon", 5, 5, COLUMNS, ROWS)).toEqual(DUNGEON_FLOOR_TILE);
  });

  it("lays the wilderness road as ground the whole way across", () => {
    for (let column = 0; column < COLUMNS; column += 1) {
      const roadRows = [];
      for (let row = 0; row < ROWS; row += 1) {
        if (groundTile("wilderness", column, row, COLUMNS, ROWS) === DIRT_TILE) roadRows.push(row);
      }
      expect(roadRows.length, `column ${column}`).toBeGreaterThan(0);
    }
    // It descends from west to east, matching the track drawn over it.
    expect(isRoadCell(0, 10, COLUMNS)).toBe(true);
    expect(isRoadCell(COLUMNS - 1, 7, COLUMNS)).toBe(true);
  });

  it("never puts a tree on the road or against an edge", () => {
    for (let column = 0; column < COLUMNS; column += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        const tree = treeAt("wilderness", column, row, COLUMNS, ROWS);
        if (!tree) continue;
        expect(isRoadCell(column, row, COLUMNS), `${column},${row}`).toBe(false);
        expect(column).toBeGreaterThan(1);
        expect(row).toBeGreaterThan(1);
        expect(column).toBeLessThan(COLUMNS - 2);
        expect(row).toBeLessThan(ROWS - 2);
      }
    }
  });

  it("puts no trees underground", () => {
    for (let column = 0; column < COLUMNS; column += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        expect(treeAt("dungeon", column, row, COLUMNS, ROWS)).toBeUndefined();
      }
    }
  });

  it("spreads grass variants rather than favouring one", () => {
    const counts = new Map<number, number>();
    for (let column = 1; column < COLUMNS - 1; column += 1) {
      for (let row = 1; row < ROWS - 1; row += 1) {
        const tile = groundTile("town", column, row, COLUMNS, ROWS);
        counts.set(tile.frame, (counts.get(tile.frame) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(GRASS_TILES.length);
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    for (const [frame, count] of counts) {
      // No variant should dominate; an even split would be 1/9 of the map.
      expect(count / total, `frame ${frame}`).toBeLessThan(0.25);
    }
  });

  it("returns 0 for a single-variant lookup instead of dividing by zero", () => {
    expect(tileVariant(4, 4, 1)).toBe(0);
    expect(tileVariant(4, 4, 0)).toBe(0);
  });
});
