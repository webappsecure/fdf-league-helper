import { describe, expect, it } from "vitest";
import { CITIES } from "@/lib/reference/cities";
import { COACH_FIRST_NAMES, COACH_LAST_NAMES } from "@/lib/reference/coach-names";
import { TABLE_A, basePoints, type Grade } from "@/lib/reference/management-tables";
import { NICKNAME_TABLES } from "@/lib/reference/nicknames";
import {
  DRAFT_PROFILES,
  FOOTNOTE_AWARDS,
  TABLE_C,
  inPairOrder,
  pairIndex,
  qualityLabel,
  qvCdvFor,
  type Quality,
} from "@/lib/reference/offense-tables";
import { PALETTE } from "@/lib/reference/palette";

const ROLL_KEYS: string[] = [];
for (let low = 1; low <= 6; low++) {
  for (let high = low; high <= 6; high++) ROLL_KEYS.push(`${low}-${high}`);
}

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

describe("management tables", () => {
  it("has a Table A row for each of the 21 ascending 2d6 rolls", () => {
    expect(Object.keys(TABLE_A).sort()).toEqual(ROLL_KEYS);
  });

  it("never hires an F coach from Table A", () => {
    const grades = Object.values(TABLE_A).flatMap((row) =>
      "question" in row ? [row.yes, row.otherwise] : [row.yes],
    );

    expect(grades).not.toContain("F");
  });

  it("matches the rulebook's Franchise Points grid", () => {
    const grades: Grade[] = ["A", "B", "C", "D", "F"];
    const grid = grades.map((frontOffice) =>
      grades.map((headCoach) => basePoints(frontOffice, headCoach)),
    );

    expect(grid).toEqual([
      [4, 3, 2, 1, 0],
      [3, 2, 1, 0, 0],
      [2, 1, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]);
  });
});

describe("offense tables", () => {
  const labels = (qualities: Quality[]) => qualities.map(qualityLabel).join(", ");

  it.each([
    [8, 2, 1],
    [18, 2, 1],
    [19, 4, 2],
    [31, 4, 2],
    [32, 6, 3],
    [43, 6, 3],
    [44, 8, 4],
    [56, 8, 4],
  ])("gives %i teams QV %i and CDV %i", (teamCount, qv, cdv) => {
    expect(qvCdvFor(teamCount)).toEqual({ qv, cdv });
  });

  it("has a Table C row for each of the 21 rolls in all four columns", () => {
    expect(Object.keys(TABLE_C)).toEqual(["PROLIFIC", "PROLIFIC_SEMI", "DULL", "DULL_SEMI"]);
    for (const profile of DRAFT_PROFILES) {
      expect(Object.keys(TABLE_C[profile]).sort(), profile).toEqual(ROLL_KEYS);
    }
  });

  it("matches the rulebook's Table C, row by row", () => {
    const printed = (profile: (typeof DRAFT_PROFILES)[number]) =>
      ROLL_KEYS.map((key) => {
        const { qualities, footnote } = TABLE_C[profile][key];
        return [labels(qualities), footnote].filter(Boolean).join(" ");
      });

    expect(printed("PROLIFIC")).toEqual([
      "a", "a", "a", "a", "SOLID• b", "SOLID• b",
      "DYNAMIC• c", "DYNAMIC• c", "DYNAMIC• c", "DYNAMIC c", "DYNAMIC c",
      "DYNAMIC c", "DYNAMIC c", "DYNAMIC•, SOLID", "DYNAMIC•, SOLID",
      "DYNAMIC•, SOLID", "DYNAMIC, SOLID•", "DYNAMIC, SOLID•",
      "SOLID b", "DYNAMIC, SOLID",
      "DYNAMIC•, SOLID•",
    ]);
    expect(printed("PROLIFIC_SEMI")).toEqual([
      "POROUS• a", "a", "a", "a", "a", "a",
      "SOLID• b", "SOLID• b", "DYNAMIC• c", "DYNAMIC• c", "DYNAMIC• c",
      "DYNAMIC c", "DYNAMIC c", "DYNAMIC c", "SOLID b",
      "DYNAMIC, SOLID", "DYNAMIC, SOLID", "DYNAMIC•, SOLID•",
      "DYNAMIC•, SOLID", "DYNAMIC•, SOLID•",
      "DYNAMIC, SOLID•",
    ]);
    expect(printed("DULL")).toEqual([
      "d", "d", "d", "d", "POROUS• e", "POROUS• e",
      "ERRATIC• f", "ERRATIC• f", "ERRATIC• f", "ERRATIC f", "ERRATIC f",
      "ERRATIC f", "ERRATIC f", "ERRATIC•, POROUS", "ERRATIC•, POROUS",
      "ERRATIC•, POROUS", "ERRATIC, POROUS•", "ERRATIC, POROUS•",
      "POROUS e", "ERRATIC, POROUS",
      "SOLID• d",
    ]);
    expect(printed("DULL_SEMI")).toEqual([
      "d", "d", "d", "d", "d", "d",
      "POROUS• e", "POROUS• e", "ERRATIC• f", "ERRATIC• f", "ERRATIC• f",
      "ERRATIC f", "ERRATIC f", "ERRATIC f", "POROUS e",
      "DYNAMIC• d", "ERRATIC, POROUS•", "ERRATIC•, POROUS•",
      "ERRATIC, SOLID f", "SOLID d",
      "SOLID• d",
    ]);
  });

  it("gives each footnote the qualities the rulebook names", () => {
    expect(Object.entries(FOOTNOTE_AWARDS).map(([note, award]) => [note, labels(award)])).toEqual([
      ["a", "DYNAMIC•, SOLID•"],
      ["b", "DYNAMIC•"],
      ["c", "SOLID•"],
      ["d", "ERRATIC•, POROUS•"],
      ["e", "ERRATIC•"],
      ["f", "POROUS•"],
    ]);
  });

  it("never puts two qualities of one pair in a row or a footnote", () => {
    const sets = [
      ...DRAFT_PROFILES.flatMap((profile) =>
        Object.values(TABLE_C[profile]).map((row) => row.qualities),
      ),
      ...Object.values(FOOTNOTE_AWARDS),
    ];

    for (const qualities of sets) {
      const pairs = qualities.map((entry) => pairIndex(entry.quality));
      expect(pairs.every((pair) => pair === 0 || pair === 1), labels(qualities)).toBe(true);
      expect(new Set(pairs).size, labels(qualities)).toBe(pairs.length);
    }
  });

  it("lists qualities in card order", () => {
    const mixed: Quality[] = [
      { quality: "INEFFICIENT", strength: "SEMI" },
      { quality: "SHAKY", strength: "FULL" },
      { quality: "POROUS", strength: "SEMI" },
      { quality: "DYNAMIC", strength: "FULL" },
    ];

    expect(labels(inPairOrder(mixed))).toBe("DYNAMIC, POROUS•, SHAKY, INEFFICIENT•");
    expect(mixed[0].quality).toBe("INEFFICIENT");
  });
});
