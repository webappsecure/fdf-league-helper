import { describe, expect, it } from "vitest";
import { ASCENDING_KEYS } from "@/lib/dice";
import { CITIES } from "@/lib/reference/cities";
import { COACH_FIRST_NAMES, COACH_LAST_NAMES } from "@/lib/reference/coach-names";
import {
  DEFENSE_DRAFT_PROFILES,
  DEFENSE_FOOTNOTE_AWARDS,
  DEFENSE_PAIRS,
  TABLE_D,
  inDefensePairOrder,
  type DefenseQuality,
} from "@/lib/reference/defense-tables";
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
import { pairIndexIn } from "@/lib/reference/profile-tables";
import {
  TABLE_E,
  isBetter,
  resultLabel,
  waysToImprove,
  type SpecialTeamsColumn,
} from "@/lib/reference/special-teams-tables";

const ROLL_KEYS = ASCENDING_KEYS;

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

describe("the ascending 2d6 keys", () => {
  it("lists the 21 reads in table order", () => {
    expect(ASCENDING_KEYS).toHaveLength(21);
    expect(ASCENDING_KEYS.slice(0, 7)).toEqual(["1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "2-2"]);
    expect(ASCENDING_KEYS.at(-1)).toBe("6-6");
  });
});

describe("defense tables", () => {
  const labels = (qualities: DefenseQuality[]) => qualities.map(qualityLabel).join(", ");
  const printed = (profile: (typeof DEFENSE_DRAFT_PROFILES)[number]) =>
    ROLL_KEYS.map((key) => {
      const { qualities, footnote } = TABLE_D[profile][key];
      return [labels(qualities), footnote].filter(Boolean).join(" ");
    });

  it("has a Table D row for each of the 21 rolls in all four columns", () => {
    expect(Object.keys(TABLE_D)).toEqual(["STAUNCH", "STAUNCH_SEMI", "INEPT", "INEPT_SEMI"]);
    for (const profile of DEFENSE_DRAFT_PROFILES) {
      expect(Object.keys(TABLE_D[profile]).sort(), profile).toEqual(ROLL_KEYS);
    }
  });

  it("matches the rulebook's Table D, row by row", () => {
    expect(printed("STAUNCH")).toEqual([
      "a", "a", "a", "a", "STIFF• c", "STIFF• c",
      "STIFF c", "STIFF c", "STIFF c", "STIFF c", "PUNISHING• b",
      "PUNISHING• b", "PUNISHING b", "PUNISHING b", "STIFF, PUNISHING•",
      "STIFF•, PUNISHING•", "STIFF•, PUNISHING•", "STIFF, PUNISHING",
      "STIFF, PUNISHING•", "STIFF, PUNISHING",
      "STIFF, PUNISHING",
    ]);
    expect(printed("STAUNCH_SEMI")).toEqual([
      "MILD• a", "a", "a", "a", "a", "a",
      "a", "a", "a", "STIFF• c", "STIFF• c",
      "STIFF• c", "STIFF c", "STIFF c", "PUNISHING• b",
      "STIFF, PUNISHING•", "PUNISHING b", "STIFF•, PUNISHING•",
      "STIFF•, PUNISHING", "STIFF•, PUNISHING•",
      "STIFF, PUNISHING",
    ]);
    expect(printed("INEPT")).toEqual([
      "d", "d", "SOFT f", "SOFT f", "SOFT f", "SOFT f",
      "SOFT f", "SOFT• f", "SOFT• f", "MILD e", "MILD• e",
      "SOFT, MILD•", "SOFT•, MILD•", "SOFT•, MILD•", "SOFT•, MILD",
      "SOFT, MILD•", "SOFT, MILD", "SOFT, MILD",
      "SOFT, MILD", "SOFT, MILD",
      "SOFT, MILD",
    ]);
    expect(printed("INEPT_SEMI")).toEqual([
      "d", "d", "d", "d", "d", "d",
      "d", "d", "SOFT• f", "SOFT• f", "SOFT• f",
      "MILD• e", "SOFT f", "SOFT f", "SOFT f",
      "MILD e", "SOFT•, MILD•", "SOFT, MILD•",
      "MILD e", "SOFT•, MILD",
      "SOFT, MILD",
    ]);
  });

  it("gives each footnote the qualities the rulebook names", () => {
    expect(
      Object.entries(DEFENSE_FOOTNOTE_AWARDS).map(([note, award]) => [note, labels(award)]),
    ).toEqual([
      ["a", "STIFF•, PUNISHING•"],
      ["b", "STIFF•"],
      ["c", "PUNISHING•"],
      ["d", "SOFT•, MILD•"],
      ["e", "SOFT•"],
      ["f", "MILD•"],
    ]);
  });

  it("never puts two qualities of one pair in a row or a footnote", () => {
    const sets = [
      ...DEFENSE_DRAFT_PROFILES.flatMap((profile) =>
        Object.values(TABLE_D[profile]).map((row) => row.qualities),
      ),
      ...Object.values(DEFENSE_FOOTNOTE_AWARDS),
    ];

    for (const qualities of sets) {
      const pairs = qualities.map((entry) => pairIndexIn(DEFENSE_PAIRS, entry.quality));
      expect(pairs.every((pair) => pair === 0 || pair === 1), labels(qualities)).toBe(true);
      expect(new Set(pairs).size, labels(qualities)).toBe(pairs.length);
    }
  });

  it("lists qualities in card order", () => {
    const mixed: DefenseQuality[] = [
      { quality: "UNDISCIPLINED", strength: "SEMI" },
      { quality: "MEEK", strength: "FULL" },
      { quality: "MILD", strength: "SEMI" },
      { quality: "STIFF", strength: "FULL" },
    ];

    expect(labels(inDefensePairOrder(mixed))).toBe("STIFF, MILD•, MEEK, UNDISCIPLINED•");
  });
});

describe("special teams table", () => {
  const printed = (column: SpecialTeamsColumn) =>
    ROLL_KEYS.map((key) => resultLabel(TABLE_E[column][key]));
  const ends = (column: SpecialTeamsColumn) => printed(column).map((range) => range.slice(3));

  it("has a Table E row for each of the 21 rolls in all five columns", () => {
    expect(Object.keys(TABLE_E)).toEqual(["kickReturn", "puntReturn", "fg", "xp15", "xp2"]);
    for (const rows of Object.values(TABLE_E)) {
      expect(Object.keys(rows).sort()).toEqual(ROLL_KEYS);
    }
  });

  it("matches the rulebook's return columns", () => {
    const none = "no quality";
    expect(printed("kickReturn")).toEqual([
      ...Array(16).fill(none),
      "ELECTRIC•", "ELECTRIC•", "ELECTRIC•", "ELECTRIC•",
      "ELECTRIC",
    ]);
    expect(printed("puntReturn")).toEqual([
      ...Array(14).fill(none),
      "ELECTRIC•", "ELECTRIC•", "ELECTRIC•", "ELECTRIC•", "ELECTRIC•",
      "ELECTRIC", "ELECTRIC",
    ]);
  });

  it("matches the rulebook's kicking columns", () => {
    expect(printed("fg").every((range) => /^11-[1-6][1-6]$/.test(range))).toBe(true);
    expect(ends("fg").join(" ")).toBe(
      "45 46 51 52 53 53 54 53 54 54 55 55 56 56 61 61 62 63 65 64 65",
    );
    expect(ends("xp15").join(" ")).toBe(
      "56 56 61 61 62 62 63 62 63 63 64 64 64 64 64 65 65 65 66 65 66",
    );
    expect(ends("xp2").join(" ")).toBe(
      "63 64 64 65 65 65 66 66 66 66 66 66 66 66 66 66 66 66 66 66 66",
    );
  });

  it("ranks ELECTRIC over ELECTRIC• over no quality, and ranges by their end", () => {
    expect(isBetter("ELECTRIC", "ELECTRIC_SEMI")).toBe(true);
    expect(isBetter("ELECTRIC_SEMI", null)).toBe(true);
    expect(isBetter(null, null)).toBe(false);
    expect(isBetter("11-51", "11-46")).toBe(true);
    expect(isBetter("11-64", "11-65")).toBe(false);
    expect(isBetter("11-65", "11-65")).toBe(false);
  });

  it.each([
    ["kickReturn", null, 8],
    ["kickReturn", "ELECTRIC_SEMI", 1],
    ["kickReturn", "ELECTRIC", 0],
    ["puntReturn", null, 11],
    ["puntReturn", "ELECTRIC_SEMI", 3],
    ["puntReturn", "ELECTRIC", 0],
    ["fg", "11-45", 35],
    ["fg", "11-61", 8],
    ["fg", "11-64", 2],
    ["fg", "11-65", 0],
    ["xp15", "11-56", 33],
    ["xp15", "11-65", 2],
    ["xp15", "11-66", 0],
    ["xp2", "11-63", 35],
    ["xp2", "11-66", 0],
  ] as const)("on %s, %s improves on %i of 36 rolls", (column, result, ways) => {
    expect(waysToImprove(TABLE_E[column], result)).toBe(ways);
  });
});
