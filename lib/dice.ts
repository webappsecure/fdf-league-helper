export type Die = 1 | 2 | 3 | 4 | 5 | 6;

// A float in [0, 1), the same contract as Math.random. Everything that rolls
// takes one, so tests can script the results.
export type Rng = () => number;

// Most rulebook tables are keyed "roll 2d6 and read in ascending order".
export function ascendingKey(a: Die, b: Die): string {
  return a <= b ? `${a}-${b}` : `${b}-${a}`;
}

export function rollD6(rng: Rng): Die {
  return (Math.floor(rng() * 6) + 1) as Die;
}

// Shuffles a stack of cards (Fisher-Yates) into a new array, calling the random
// source once per swap. A source that always returns just under 1 keeps the
// order, which lets tests script the draws.
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const cards = [...items];
  for (let last = cards.length - 1; last > 0; last--) {
    const pick = Math.floor(rng() * (last + 1));
    [cards[last], cards[pick]] = [cards[pick], cards[last]];
  }
  return cards;
}

// A repeatable random source (mulberry32) over an unsigned 32-bit seed, so a
// run can be replayed from its stored seed. Not for anything secret.
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// 2d10 read as tens then ones, 1 to 100. A roll of 0 and 0 is 100.
export function rollD100(rng: Rng): number {
  const tens = Math.floor(rng() * 10);
  const ones = Math.floor(rng() * 10);
  return tens * 10 + ones || 100;
}
