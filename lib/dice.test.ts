import { describe, expect, it } from "vitest";
import { ascendingKey, rollD100, type Rng } from "@/lib/dice";

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
