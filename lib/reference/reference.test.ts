import { describe, expect, it } from "vitest";
import { CITIES } from "@/lib/reference/cities";
import { COACH_FIRST_NAMES, COACH_LAST_NAMES } from "@/lib/reference/coach-names";
import { NICKNAME_TABLES } from "@/lib/reference/nicknames";
import { PALETTE } from "@/lib/reference/palette";

describe("reference data", () => {
  it("has 68 distinct cities whose weights cover the 1 to 348 roll", () => {
    expect(CITIES).toHaveLength(68);
    expect(new Set(CITIES.map((city) => city.name)).size).toBe(68);
    expect(CITIES.reduce((total, city) => total + city.weight, 0)).toBe(348);
    expect(CITIES[0]).toEqual({ name: "New York", weight: 42 });
    expect(CITIES[67]).toEqual({ name: "Winston-Salem", weight: 1 });
    expect(CITIES.map((city) => city.name)).toEqual(
      expect.arrayContaining(["Cincinnati", "Wichita"]),
    );
  });

  it("has three nickname tables of 100 with the rulebook's first and last entries", () => {
    expect(NICKNAME_TABLES.map((table) => table.length)).toEqual([100, 100, 100]);
    expect(NICKNAME_TABLES.map((table) => [table[0], table[49], table[99]])).toEqual([
      ["49ers", "Gunners", "Wranglers"],
      ["Aces", "Lizards", "Yellow Jackets"],
      ["Academics", "Legends", "Wild Pigs"],
    ]);
  });

  it("has 100 first names and 100 last names", () => {
    expect([COACH_FIRST_NAMES.length, COACH_LAST_NAMES.length]).toEqual([100, 100]);
    expect([COACH_FIRST_NAMES[0], COACH_FIRST_NAMES[49], COACH_FIRST_NAMES[99]]).toEqual([
      "Adam",
      "Jerry",
      "Weeb",
    ]);
    expect([COACH_LAST_NAMES[0], COACH_LAST_NAMES[49], COACH_LAST_NAMES[99]]).toEqual([
      "Adams",
      "Lee",
      "Young",
    ]);
  });

  it("has no blank or padded names", () => {
    const names = [...NICKNAME_TABLES.flat(), ...COACH_FIRST_NAMES, ...COACH_LAST_NAMES];
    expect(names.filter((name) => name.length === 0 || name !== name.trim())).toEqual([]);
  });

  it("has 18 distinct palette colors in lowercase hex", () => {
    expect(PALETTE).toHaveLength(18);
    expect(new Set(PALETTE.map((color) => color.hex)).size).toBe(18);
    expect(PALETTE.filter((color) => !/^#[0-9a-f]{6}$/.test(color.hex))).toEqual([]);
  });
});
