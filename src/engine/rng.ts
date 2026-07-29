export interface RngState {
  readonly value: number;
}

export interface RandomResult<T> {
  readonly value: T;
  readonly rng: RngState;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed: string): RngState {
  return { value: hashSeed(seed) || 0x6d2b79f5 };
}

export function nextRandom(rng: RngState): RandomResult<number> {
  const nextState = (rng.value + 0x6d2b79f5) >>> 0;
  let mixed = nextState;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return {
    value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296,
    rng: { value: nextState }
  };
}

export function randomInt(rng: RngState, minimum: number, maximum: number): RandomResult<number> {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) {
    throw new RangeError("randomInt requires integer bounds with maximum >= minimum");
  }
  const result = nextRandom(rng);
  return {
    value: Math.floor(result.value * (maximum - minimum + 1)) + minimum,
    rng: result.rng
  };
}

export function randomChance(rng: RngState, probability: number): RandomResult<boolean> {
  const result = nextRandom(rng);
  return {
    value: result.value < Math.max(0, Math.min(1, probability)),
    rng: result.rng
  };
}

