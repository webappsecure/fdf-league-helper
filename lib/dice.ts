export type Die = 1 | 2 | 3 | 4 | 5 | 6;

// A float in [0, 1), the same contract as Math.random. Everything that rolls
// takes one, so tests can script the results.
export type Rng = () => number;

// Most rulebook tables are keyed "roll 2d6 and read in ascending order".
export function ascendingKey(a: Die, b: Die): string {
  return a <= b ? `${a}-${b}` : `${b}-${a}`;
}

// 2d10 read as tens then ones, 1 to 100. A roll of 0 and 0 is 100.
export function rollD100(rng: Rng): number {
  const tens = Math.floor(rng() * 10);
  const ones = Math.floor(rng() * 10);
  return tens * 10 + ones || 100;
}
