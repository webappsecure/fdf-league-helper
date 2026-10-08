export type Die = 1 | 2 | 3 | 4 | 5 | 6;

// Most rulebook tables are keyed "roll 2d6 and read in ascending order".
export function ascendingKey(a: Die, b: Die): string {
  return a <= b ? `${a}-${b}` : `${b}-${a}`;
}
