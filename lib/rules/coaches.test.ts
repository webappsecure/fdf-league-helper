import { describe, expect, it } from "vitest";
import { seededRng, type Rng } from "@/lib/dice";
import type { Grade } from "@/lib/reference/management-tables";
import { TABLE_B, TABLE_F } from "@/lib/reference/offseason-tables";
import { runCoaches, type CoachInput, type PreviousRecord } from "@/lib/rules/coaches";

// A random source that returns the scripted values in order. `d` turns a die
// face into the value that rolls it; a coach name takes four values.
function script(...values: number[]): Rng {
  let next = 0;
  return () => {
    if (next >= values.length) throw new Error("rolled more than the script holds");
    return values[next++];
  };
}
const d = (face: number) => (face - 0.5) / 6;
const NAME = [0.01, 0.02, 0.03, 0.04];
// The two dice that read as a Table B key.
const ownership = (a: number, b: number) => [d(a), d(b)];

const record = (wins: number, losses: number, extra: Partial<PreviousRecord> = {}) => ({
  wins,
  losses,
  ties: 0,
  madePlayoffs: false,
  isChampion: false,
  ...extra,
});

function team(id: number, extra: Partial<CoachInput> = {}): CoachInput {
  return {
    franchiseId: id,
    teamName: `Team ${id}`,
    coachName: `Coach ${id}`,
    frontOfficeGrade: "B",
    headCoachGrade: "C",
    hotSeat: false,
    ownershipStyle: null,
    ownershipLoyalty: null,
    previous: record(8, 8),
    ...extra,
  };
}

// Runs one team that needs no carousel roll (grade B or C, off the hot seat).
function grade(input: Partial<CoachInput>) {
  return runCoaches([team(1, input)], [], script(...ownership(2, 4))).teams[0];
}

describe("head coach grade (step 2)", () => {
  it.each<[string, Grade, Partial<PreviousRecord>, Grade]>([
    ["champion C", "C", { isChampion: true, madePlayoffs: true }, "A"],
    ["champion B", "B", { isChampion: true, madePlayoffs: true }, "A"],
    ["champion A", "A", { isChampion: true, madePlayoffs: true }, "A"],
    ["winning record C", "C", { wins: 9, losses: 7 }, "B"],
    ["winning record B stays", "B", { wins: 9, losses: 7 }, "B"],
    ["winning record A stays", "A", { wins: 9, losses: 7 }, "A"],
    ["playoffs with a losing record C", "C", { madePlayoffs: true, wins: 6, losses: 10 }, "B"],
    ["losing record B", "B", { wins: 6, losses: 10 }, "C"],
    ["even record, no playoffs", "C", {}, "C"],
  ])("%s", (_name, before, previous, expected) => {
    const result = grade({ headCoachGrade: before, previous: { ...record(8, 8), ...previous } });
    expect(result.headCoachGrade).toBe(expected);
  });

  it("moves a losing C coach to D and rolls the carousel", () => {
    const { teams } = runCoaches(
      [team(1, { previous: record(6, 10) })],
      [],
      script(d(6), ...ownership(2, 4)),
    );
    expect(teams[0]).toMatchObject({ headCoachGrade: "D", hotSeat: false });
  });

  it("raises a low champion by two grades", () => {
    const champion = record(12, 4, { isChampion: true, madePlayoffs: true });
    expect(grade({ headCoachGrade: "D", previous: champion }).headCoachGrade).toBe("B");
    expect(grade({ headCoachGrade: "F", previous: champion }).headCoachGrade).toBe("C");
  });

  it("removes the hot seat on a winning record only", () => {
    expect(grade({ hotSeat: true, previous: record(9, 7) }).hotSeat).toBe(false);
    // 8-8 keeps it, and a hot seat coach rolls the carousel; roll 4 does not fire.
    const kept = runCoaches([team(1, { hotSeat: true })], [], script(d(4), ...ownership(2, 4)))
      .teams[0];
    expect(kept.hotSeat).toBe(true);
    expect(kept.headCoachName).toBe("Coach 1");
  });
});

describe("coaching carousel (step 3)", () => {
  // One team on grade `before`, an 8-8 record, so the grade does not move.
  function carousel(roll: number, before: Grade, hotSeat: boolean, ...hire: number[]) {
    return runCoaches(
      [team(1, { headCoachGrade: before, hotSeat })],
      [],
      script(d(roll), ...hire, ...ownership(2, 4)),
    );
  }
  const HIRE = [d(3), d(3), ...NAME]; // Table A 3-3: grade B

  it("skips a coach off the hot seat with grade A, B or C", () => {
    const result = runCoaches([team(1)], [], script(...ownership(2, 4)));
    expect(result.log.some((entry) => entry.step === "carousel")).toBe(false);
  });

  it.each([1, 2, 3])("roll %i fires a hot seat coach and hires a replacement", (roll) => {
    const { teams, log } = carousel(roll, "C", true, ...HIRE);
    expect(teams[0]).toMatchObject({ headCoachGrade: "B", hotSeat: false });
    expect(teams[0].headCoachName).not.toBe("Coach 1");
    expect(log.find((entry) => entry.step === "carousel")?.message).toContain("is fired");
  });

  it.each([4, 5, 6])("roll %i does not fire a hot seat coach", (roll) => {
    const { teams } = carousel(roll, "C", true);
    expect(teams[0]).toMatchObject({ headCoachName: "Coach 1", hotSeat: true });
  });

  it.each(
    Object.entries(TABLE_F).flatMap(([roll, row]) =>
      (["D", "F"] as const).map((before): [number, Grade, boolean] => [
        Number(roll),
        before,
        row.hotSeatGrades.includes(before),
      ]),
    ),
  )("roll %i, grade %s, off the hot seat: hot seat %s", (roll, before, expected) => {
    expect(carousel(roll, before, false).teams[0].hotSeat).toBe(expected);
  });

  it("a replacement coach's name is not one already taken", () => {
    // Find a seed whose carousel roll fires the coach.
    const seed = Array.from({ length: 200 }, (_, i) => i).find(
      (i) =>
        runCoaches([team(1, { hotSeat: true })], [], seededRng(i)).teams[0].headCoachName !==
        "Coach 1",
    )!;
    const first = runCoaches([team(1, { hotSeat: true })], [], seededRng(seed)).teams[0];
    const second = runCoaches([team(1, { hotSeat: true })], [first.headCoachName], seededRng(seed));
    expect(second.teams[0].headCoachName).not.toBe(first.headCoachName);
  });

  it("a team with no previous season rolls and starts off the hot seat", () => {
    const { teams } = runCoaches(
      [team(1, { previous: null, headCoachGrade: "D" })],
      [],
      script(d(4), ...ownership(2, 4)),
    );
    expect(teams[0].hotSeat).toBe(true);
  });
});

describe("Franchise Points (steps 4 and 5)", () => {
  it("awards base FP from the grades after the carousel", () => {
    // Front office A, coach B: 3 FP; roll 2-4 is +1. No previous season, no bonus.
    const result = grade({ frontOfficeGrade: "A", headCoachGrade: "B", previous: null });
    expect(result.franchisePoints).toBe(4);
  });

  const teams = (records: PreviousRecord[]) =>
    records.map((previous, index) =>
      team(index + 1, { previous, frontOfficeGrade: "F", headCoachGrade: "A" }),
    );
  const fpOf = (records: PreviousRecord[]) => {
    // Table B 2-4 for every team is +1 FP with no quality needed; subtract it.
    const rolls = records.flatMap(() => ownership(2, 4));
    return runCoaches(teams(records), [], script(...rolls)).teams.map((t) => t.franchisePoints - 1);
  };

  it("gives +3 to the worst record and +2 to the rest of the bottom 15%", () => {
    // 20 teams: round(3) = 3 teams in the bottom group.
    const records = Array.from({ length: 20 }, (_, i) => record(i + 1, 20 - i));
    const bonus = fpOf(records);
    expect(bonus.slice(0, 3)).toEqual([3, 2, 2]);
    expect(bonus.slice(3).every((points) => points === 0)).toBe(true);
  });

  it("gives every team tied at the worst record +3", () => {
    const records = [record(2, 10), record(2, 10), record(5, 7), record(9, 3)];
    expect(fpOf(records)).toEqual([3, 3, 0, 0]);
  });

  it("includes teams tied at the 15% cutoff", () => {
    // 10 teams: round(1.5) = 2, so the worst plus the second; a third ties the second.
    const records = [
      record(1, 9),
      record(3, 7),
      record(3, 7),
      ...Array.from({ length: 7 }, () => record(8, 2)),
    ];
    expect(fpOf(records).slice(0, 4)).toEqual([3, 2, 2, 0]);
  });

  it("counts a tie as half a win", () => {
    // 4-4-8 is 50%, better than 5-10-1 at 34%.
    const records = [
      record(5, 10, { ties: 1 }),
      record(4, 4, { ties: 8 }),
      record(8, 8),
      record(9, 7),
    ];
    expect(fpOf(records)).toEqual([3, 0, 0, 0]);
  });

  it("gives an expansion team no bonus", () => {
    const rolls = ownership(2, 4).concat(ownership(2, 4));
    const result = runCoaches(
      [
        team(1, { previous: record(2, 10), frontOfficeGrade: "F", headCoachGrade: "A" }),
        team(2, { previous: null, frontOfficeGrade: "F", headCoachGrade: "A" }),
      ],
      [],
      script(...rolls),
    );
    expect(result.teams.map((t) => t.franchisePoints)).toEqual([4, 1]);
  });
});

describe("ownership impact (step 6)", () => {
  type Own = [CoachInput["ownershipStyle"], CoachInput["ownershipLoyalty"]];
  const NONE: Own = [null, null];

  function impact(key: string, [style, loyalty]: Own) {
    const [a, b] = key.split("-").map(Number);
    // Front office A and coach C give 2 FP, and no previous season means no bonus.
    const result = runCoaches(
      [
        team(1, {
          ownershipStyle: style,
          ownershipLoyalty: loyalty,
          frontOfficeGrade: "A",
          headCoachGrade: "C",
          previous: null,
        }),
      ],
      [],
      script(...ownership(a, b)),
    );
    return result.teams[0];
  }

  it("has all 21 rows", () => {
    expect(Object.keys(TABLE_B)).toHaveLength(21);
  });

  // Each row, with a team that holds its quality, and the FP it should leave
  // from 2 FP (front office A, coach C).
  it.each([
    ["1-1", NONE, 0],
    ["1-2", ["MEDDLING", null], 0],
    ["1-2", [null, "SELFISH"], 0],
    ["1-3", ["MEDDLING", null], 1],
    ["1-4", [null, "SELFISH"], 1],
    ["1-5", ["MEDDLING", null], 1],
    ["1-6", ["MEDDLING", null], 1],
    ["2-3", [null, "SELFISH"], 1],
    ["2-3", ["MEDDLING", null], 1],
    ["2-4", NONE, 3],
    ["2-5", ["MEDDLING", null], 1],
    ["2-6", ["SAVVY", null], 3],
    ["3-3", [null, "SELFISH"], 0],
    ["3-4", ["SAVVY", null], 3],
    ["3-5", [null, "LOYAL"], 3],
    ["3-6", ["SAVVY", null], 3],
    ["4-4", ["SAVVY", null], 4],
    ["4-5", ["SAVVY", null], 3],
    ["4-6", ["SAVVY", null], 3],
    ["5-6", ["SAVVY", null], 4],
    ["5-6", [null, "LOYAL"], 4],
    ["6-6", NONE, 4],
  ] as [string, Own, number][])("row %s for %j leaves %i FP", (key, own, expected) => {
    expect(impact(key, own).franchisePoints).toBe(expected);
  });

  it.each([
    ["1-1", ["SAVVY", null], 2],
    ["6-6", [null, "SELFISH"], 2],
    ["1-2", NONE, 2],
    ["1-3", NONE, 2],
    ["1-3", ["SAVVY", null], 2],
    ["2-6", NONE, 2],
    ["3-3", NONE, 2],
    ["3-5", NONE, 2],
    ["4-4", [null, "LOYAL"], 2],
    ["5-6", NONE, 2],
  ] as [string, Own, number][])("row %s does not apply to %j", (key, own, expected) => {
    expect(impact(key, own).franchisePoints).toBe(expected);
  });

  it("2-2 makes a MEDDLING team SELFISH and changes nothing else", () => {
    const result = impact("2-2", ["MEDDLING", null]);
    expect(result).toMatchObject({
      ownershipStyle: "MEDDLING",
      ownershipLoyalty: "SELFISH",
      franchisePoints: 2,
    });
    expect(impact("2-2", ["SAVVY", null]).ownershipLoyalty).toBeNull();
  });

  it("5-5 makes a SAVVY team LOYAL", () => {
    expect(impact("5-5", ["SAVVY", null])).toMatchObject({
      ownershipStyle: "SAVVY",
      ownershipLoyalty: "LOYAL",
    });
    expect(impact("5-5", NONE).ownershipLoyalty).toBeNull();
  });

  it("3-3 sets the front office grade to D for a SELFISH team", () => {
    expect(impact("3-3", [null, "SELFISH"]).frontOfficeGrade).toBe("D");
    expect(impact("3-3", NONE).frontOfficeGrade).toBe("A");
  });

  it("never lowers FP below 0", () => {
    const result = runCoaches(
      [team(1, { frontOfficeGrade: "F", ownershipStyle: "MEDDLING", previous: null })],
      [],
      script(...ownership(1, 2)),
    );
    expect(result.teams[0].franchisePoints).toBe(0);
  });

  it("logs every step for every team", () => {
    const { log } = runCoaches(
      [team(1), team(2)],
      [],
      script(...ownership(2, 4), ...ownership(2, 4)),
    );
    const steps = new Set(log.map((entry) => entry.step));
    expect(steps).toEqual(
      new Set(["coach-grade", "base-points", "bonus-points", "ownership-impact"]),
    );
    expect(log.filter((entry) => entry.step === "ownership-impact")).toHaveLength(2);
  });
});
