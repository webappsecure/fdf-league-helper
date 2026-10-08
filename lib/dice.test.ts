import { describe, expect, it } from "vitest";
import { ascendingKey } from "@/lib/dice";

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
