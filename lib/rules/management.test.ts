import { describe, expect, it } from "vitest";
import { seededRng, type Rng } from "@/lib/dice";
import { TABLE_A, basePoints } from "@/lib/reference/management-tables";
import { rollManagement, type ManagementInput } from "@/lib/rules/management";

// A random source that makes rollD6 return the given faces in order.
function dice(...faces: number[]): Rng {
  let next = 0;
  return () => {
    if (next >= faces.length) throw new Error("rolled more dice than the script holds");
    return (faces[next++] - 0.5) / 6;
  };
}

function team(franchiseId: number, teamName = `Team ${franchiseId}`): ManagementInput {
  return { franchiseId, teamName, coachName: `Coach ${franchiseId}` };
}

// One team: style, loyalty, front office, then the two Table A dice.
function one(style: number, loyalty: number, frontOffice: number, first: number, second: number) {
  return rollManagement([team(1)], dice(style, loyalty, frontOffice, first, second)).teams[0];
}

describe("ownership (step 3)", () => {
  it.each([
    [1, "MEDDLING"],
    [2, null],
    [5, null],
    [6, "SAVVY"],
  ])("style roll %i gives %s", (roll, expected) => {
    expect(one(roll, 3, 3, 3, 3).ownershipStyle).toBe(expected);
  });

  it.each([
    [1, "SELFISH"],
    [2, null],
    [5, null],
    [6, "LOYAL"],
  ])("loyalty roll %i gives %s", (roll, expected) => {
    expect(one(3, roll, 3, 3, 3).ownershipLoyalty).toBe(expected);
  });
});

describe("front office grade (step 4)", () => {
  it.each([
    [1, "D"],
    [2, "C"],
    [3, "C"],
    [4, "B"],
    [5, "B"],
    [6, "A"],
  ])("roll %i gives %s", (roll, expected) => {
    expect(one(3, 3, roll, 3, 3).frontOfficeGrade).toBe(expected);
  });
});

// One case per outcome of every Table A row: the roll, a style roll, a front
// office roll and the grade hired. Front office rolls: 6 is A, 4 is B, 2 is C,
// 1 is D. Style rolls: 1 MEDDLING, 6 SAVVY, 3 no quality.
const TABLE_A_CASES = [
  ["1-1", 6, 2, "B"],
  ["1-1", 3, 2, "D"],
  ["1-2", 3, 6, "C"],
  ["1-2", 3, 4, "D"],
  ["1-3", 3, 4, "C"],
  ["1-3", 3, 2, "D"],
  ["1-4", 6, 1, "A"],
  ["1-4", 1, 6, "C"],
  ["1-5", 3, 1, "C"],
  ["1-6", 3, 2, "D"],
  ["1-6", 3, 1, "D"],
  ["1-6", 3, 4, "C"],
  ["2-2", 3, 6, "C"],
  ["2-3", 3, 6, "B"],
  ["2-3", 3, 4, "C"],
  ["2-4", 3, 1, "D"],
  ["2-4", 3, 2, "C"],
  ["2-5", 3, 6, "B"],
  ["2-5", 3, 4, "B"],
  ["2-5", 3, 2, "C"],
  ["2-6", 1, 6, "D"],
  ["2-6", 6, 1, "B"],
  ["3-3", 1, 1, "B"],
  ["3-4", 3, 6, "A"],
  ["3-4", 3, 4, "B"],
  ["3-5", 3, 1, "C"],
  ["3-5", 3, 2, "B"],
  ["3-6", 1, 1, "B"],
  ["4-4", 1, 6, "C"],
  ["4-4", 3, 1, "A"],
  ["4-5", 1, 1, "B"],
  ["4-6", 3, 2, "C"],
  ["4-6", 3, 1, "C"],
  ["4-6", 3, 4, "B"],
  ["5-5", 1, 1, "A"],
  ["5-6", 3, 1, "B"],
  ["5-6", 3, 2, "A"],
  ["6-6", 1, 1, "A"],
] as const;

describe("head coach grade (step 6, Table A)", () => {
  it.each(TABLE_A_CASES)("roll %s with style %i and front office roll %i hires %s", (key, style, fo, grade) => {
    const [low, high] = key.split("-").map(Number);

    expect(one(style, 3, fo, low, high).headCoachGrade).toBe(grade);
    // The dice are read in ascending order whichever came up first.
    expect(one(style, 3, fo, high, low).headCoachGrade).toBe(grade);
  });

  it("has a case for every outcome of every Table A row", () => {
    const hired = (key: string) => {
      const cases = TABLE_A_CASES.filter(([roll]) => roll === key);
      return [...new Set(cases.map(([, , , grade]) => grade))].sort();
    };

    for (const [key, row] of Object.entries(TABLE_A)) {
      const outcomes = "question" in row ? [row.yes, row.otherwise] : [row.yes];
      expect(hired(key), `row ${key}`).toEqual([...new Set(outcomes)].sort());
    }
    expect(TABLE_A_CASES.filter(([roll]) => !(roll in TABLE_A))).toEqual([]);
  });
});

describe("rollManagement", () => {
  it("finishes each step for the whole league before starting the next", () => {
    // Two teams. Step 3: style and loyalty for each. Step 4: one die each.
    // Step 6: two dice each.
    const rng = dice(6, 1, 1, 6, 6, 1, 1, 4, 2, 6);

    const { teams, log } = rollManagement([team(10), team(20)], rng);

    expect(teams).toEqual([
      {
        franchiseId: 10,
        ownershipStyle: "SAVVY",
        ownershipLoyalty: "SELFISH",
        frontOfficeGrade: "A",
        headCoachGrade: "A",
        basePoints: 4,
      },
      {
        franchiseId: 20,
        ownershipStyle: "MEDDLING",
        ownershipLoyalty: "LOYAL",
        frontOfficeGrade: "D",
        headCoachGrade: "D",
        basePoints: 0,
      },
    ]);
    expect(log.map((entry) => [entry.step, entry.franchiseId])).toEqual([
      ["ownership", 10],
      ["ownership", 20],
      ["front-office", 10],
      ["front-office", 20],
      ["head-coach", 10],
      ["head-coach", 20],
      ["franchise-points", 10],
      ["franchise-points", 20],
    ]);
  });

  it("writes a log line a reader can check against the rulebook", () => {
    const input = { franchiseId: 1, teamName: "Chicago Aces", coachName: "Adam Adams" };

    const { log } = rollManagement([input], dice(6, 3, 4, 4, 1));

    expect(log.map((entry) => entry.message)).toEqual([
      "Chicago Aces: style roll 6, SAVVY. Loyalty roll 3, no quality.",
      "Chicago Aces: roll 4, Front Office Grade B.",
      "Chicago Aces: Adam Adams, roll 1-4. SAVVY ownership? Yes. Head Coach Grade A.",
      "Chicago Aces: Front Office B and Head Coach A, 3 FP.",
    ]);
  });

  it("leaves the question out of the log for a row that has none", () => {
    const { log } = rollManagement([team(1, "Boston Bolts")], dice(3, 3, 1, 3, 3));

    expect(log[2].message).toBe("Boston Bolts: Coach 1, roll 3-3. Head Coach Grade B.");
  });

  it("says No when the question does not hold", () => {
    const { log } = rollManagement([team(1, "Boston Bolts")], dice(3, 3, 2, 6, 5));

    expect(log[2].message).toBe(
      "Boston Bolts: Coach 1, roll 5-6. Front Office Grade D? No. Head Coach Grade A.",
    );
  });

  it("gives the same league for the same seed", () => {
    const teams = Array.from({ length: 56 }, (_, index) => team(index + 1));

    expect(rollManagement(teams, seededRng(99))).toEqual(rollManagement(teams, seededRng(99)));
    expect(rollManagement(teams, seededRng(99))).not.toEqual(
      rollManagement(teams, seededRng(100)),
    );
  });

  it.each([1, 2, 3])("never grades anyone F and matches the FP grid (seed %i)", (seed) => {
    const teams = Array.from({ length: 56 }, (_, index) => team(index + 1));

    const result = rollManagement(teams, seededRng(seed));

    expect(result.teams).toHaveLength(56);
    expect(result.log).toHaveLength(56 * 4);
    for (const rolled of result.teams) {
      expect(["A", "B", "C", "D"]).toContain(rolled.frontOfficeGrade);
      expect(["A", "B", "C", "D"]).toContain(rolled.headCoachGrade);
      expect(rolled.basePoints).toBe(basePoints(rolled.frontOfficeGrade, rolled.headCoachGrade));
    }
  });

  it("returns nothing for no teams", () => {
    expect(rollManagement([], dice())).toEqual({ teams: [], log: [] });
  });
});
