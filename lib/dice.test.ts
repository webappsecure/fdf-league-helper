import { describe, expect, it } from "vitest";
import { ascendingKey, rollD100, rollD6, seededRng, shuffle, type Rng } from "@/lib/dice";

// Replays the given values in order, then repeats them.
function scripted(values: number[]): Rng {
  let next = 0;
  return () => values[next++ % values.length];
}

describe("ascendingKey", () => {
  it("puts the lower die first", () => {
    expect(ascendingKey(5, 2)).toBe("2-5");
  });

  it("keeps an already ascending roll", () => {
    expect(ascendingKey(1, 6)).toBe("1-6");
  });

  it("handles doubles", () => {
    expect(ascendingKey(4, 4)).toBe("4-4");
  });
});

describe("rollD100", () => {
  it.each([
    [0, 0, 100],
    [0, 0.1, 1],
    [0.1, 0, 10],
    [0.45, 0.72, 47],
    [0.99, 0.99, 99],
  ])("reads tens %d and ones %d as %i", (tens, ones, expected) => {
    expect(rollD100(scripted([tens, ones]))).toBe(expected);
  });

  it("rolls the tens die first", () => {
    expect(rollD100(scripted([0.3, 0.8]))).toBe(38);
  });
});

describe("rollD6", () => {
  it.each([
    [0, 1],
    [0.166, 1],
    [0.167, 2],
    [0.5, 4],
    [0.834, 6],
    [0.999999, 6],
  ])("turns %d into %i", (value, expected) => {
    expect(rollD6(scripted([value]))).toBe(expected);
  });
});

describe("seededRng", () => {
  const take = (rng: Rng, count: number) => Array.from({ length: count }, () => rng());

  it("repeats the same sequence for the same seed", () => {
    expect(take(seededRng(12345), 20)).toEqual(take(seededRng(12345), 20));
  });

  it("gives different sequences for different seeds", () => {
    expect(take(seededRng(1), 5)).not.toEqual(take(seededRng(2), 5));
  });

  it("stays in [0, 1) and reaches every face of a die", () => {
    const values = take(seededRng(4294967295), 2000);

    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values.map((value) => Math.floor(value * 6) + 1)).size).toBe(6);
  });
});

describe("shuffle", () => {
  const cards = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("keeps every card and leaves the input untouched", () => {
    const input = [...cards];

    const shuffled = shuffle(input, seededRng(7));

    expect([...shuffled].sort((a, b) => a - b)).toEqual(cards);
    expect(shuffled).not.toEqual(cards);
    expect(input).toEqual(cards);
  });

  it("gives the same order for the same seed and another for a different one", () => {
    expect(shuffle(cards, seededRng(99))).toEqual(shuffle(cards, seededRng(99)));
    expect(shuffle(cards, seededRng(99))).not.toEqual(shuffle(cards, seededRng(100)));
  });

  it("calls the random source once per swap", () => {
    let calls = 0;

    const kept = shuffle(cards, () => {
      calls++;
      return 0.9999;
    });

    expect(calls).toBe(9);
    expect(kept).toEqual(cards);
    expect(shuffle([], seededRng(1))).toEqual([]);
  });

  it("can put any card in any place", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) seen.add(shuffle([1, 2, 3], seededRng(seed)).join(""));

    expect(seen.size).toBe(6);
  });
});
