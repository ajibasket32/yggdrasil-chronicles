export interface GridPoint {
  x: number;
  y: number;
}

// These positions keep NPCs clear of the player spawn and map edges. They are
// deliberately distinct so every resident can be approached and spoken to.
const NPC_SPAWN_POINTS: readonly GridPoint[] = [
  { x: 8, y: 9 },
  { x: 13, y: 10 },
  { x: 17, y: 6 },
  { x: 6, y: 12 },
  { x: 15, y: 13 },
  { x: 11, y: 5 },
  { x: 4, y: 10 },
  { x: 19, y: 11 },
  { x: 9, y: 14 },
  { x: 18, y: 4 },
  { x: 3, y: 6 },
  { x: 20, y: 14 }
];

export function getNpcSpawnPoints(count: number): GridPoint[] {
  return NPC_SPAWN_POINTS.slice(0, Math.max(0, count));
}
