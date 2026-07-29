import { describe, expect, it } from "vitest";
import { createRng, nextRandom, randomInt } from "../../src/engine/rng";

describe("seeded randomness", () => {
  it("replays the same sequence for the same seed", () => {
    let first = createRng("chronicle-42");
    let second = createRng("chronicle-42");
    const firstValues: number[] = [];
    const secondValues: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      const firstRoll = nextRandom(first);
      const secondRoll = nextRandom(second);
      firstValues.push(firstRoll.value);
      secondValues.push(secondRoll.value);
      first = firstRoll.rng;
      second = secondRoll.rng;
    }
    expect(firstValues).toEqual(secondValues);
  });

  it("returns inclusive bounded integers", () => {
    let rng = createRng("bounded");
    for (let index = 0; index < 100; index += 1) {
      const roll = randomInt(rng, 2, 5);
      expect(roll.value).toBeGreaterThanOrEqual(2);
      expect(roll.value).toBeLessThanOrEqual(5);
      rng = roll.rng;
    }
  });
});

