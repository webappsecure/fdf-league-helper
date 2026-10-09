import { describe, expect, it } from "vitest";
import { seededRng, type Rng } from "@/lib/dice";
import type { DefenseProfile } from "@/lib/reference/defense-tables";
import type { Grade } from "@/lib/reference/management-tables";
import { qualityLabel, type OffenseProfile } from "@/lib/reference/offense-tables";
import {
  CAMP_STEPS,
  adjustFrontOffice,
  runTrainingCamp,
  type CampTeam,
} from "@/lib/rules/training-camp";

// Just under 1: every shuffle keeps its order.
const keep: Rng = () => 0.9999;

type Spec = Partial<
  Pick<
    CampTeam,
    | "frontOfficeGrade"
    | "headCoachGrade"
    | "points"
    | "previousOffense"
    | "previousDefense"
    | "offenseProfile"
    | "defenseProfile"
    | "offenseQualities"
  >
>;

function teams(count: number, specs: Record<number, Spec> = {}): CampTeam[] {
  return Array.from({ length: count }, (_, index) => ({
    franchiseId: index + 1,
    teamName: `T${index + 1}`,
    headCoachGrade: "C" as Grade,
    frontOfficeGrade: "C" as Grade,
    points: 0,
    previousOffense: "AVERAGE" as OffenseProfile,
    previousDefense: "AVERAGE" as DefenseProfile,
    offenseProfile: "AVERAGE" as OffenseProfile,
    defenseProfile: "AVERAGE" as DefenseProfile,
    offenseQualities: [],
    defenseQualities: [],
    ...specs[index + 1],
  }));
}

function qualities(result: ReturnType<typeof runTrainingCamp>, id: number): string {
  const team = result.results.find((entry) => entry.franchiseId === id)!;
  return [...team.offenseQualities, ...team.defenseQualities].map(qualityLabel).join(", ");
}

function messages(result: ReturnType<typeof runTrainingCamp>, step?: string): string[] {
  return result.log.filter((entry) => !step || entry.step === step).map((e) => e.message);
}

describe("front office grade adjustment (step 1)", () => {
  const avg = { offense: "AVERAGE", defense: "AVERAGE" } as const;
  const move = (
    from: { offense: OffenseProfile; defense: DefenseProfile },
    to: { offense: OffenseProfile; defense: DefenseProfile },
  ) => adjustFrontOffice("C", from, to).change;

  it("follows the rulebook table on offense", () => {
    const side = (offense: OffenseProfile) => ({ ...avg, offense });
    expect(move(side("DULL"), side("PROLIFIC"))).toBe(2);
    expect(move(side("AVERAGE"), side("PROLIFIC"))).toBe(1);
    expect(move(side("DULL"), side("AVERAGE"))).toBe(1);
    expect(move(side("PROLIFIC"), side("DULL"))).toBe(-2);
    expect(move(side("PROLIFIC"), side("AVERAGE"))).toBe(-1);
    expect(move(side("AVERAGE"), side("DULL"))).toBe(-1);
  });

  it("follows the rulebook table on defense", () => {
    const side = (defense: DefenseProfile) => ({ ...avg, defense });
    expect(move(side("INEPT"), side("STAUNCH"))).toBe(2);
    expect(move(side("AVERAGE"), side("STAUNCH"))).toBe(1);
    expect(move(side("INEPT"), side("AVERAGE"))).toBe(1);
    expect(move(side("STAUNCH"), side("INEPT"))).toBe(-2);
    expect(move(side("STAUNCH"), side("AVERAGE"))).toBe(-1);
    expect(move(side("AVERAGE"), side("INEPT"))).toBe(-1);
  });

  it("counts SEMI as FULL and does nothing when the profile stays", () => {
    const side = (offense: OffenseProfile) => ({ ...avg, offense });
    expect(move(side("DULL_SEMI"), side("PROLIFIC_SEMI"))).toBe(2);
    expect(move(side("PROLIFIC"), side("PROLIFIC_SEMI"))).toBe(0);
    expect(move(avg, avg)).toBe(0);
  });

  it("adds both sides, so opposite moves cancel", () => {
    expect(
      move({ offense: "DULL", defense: "STAUNCH" }, { offense: "PROLIFIC", defense: "INEPT" }),
    ).toBe(0);
    expect(
      move({ offense: "DULL", defense: "INEPT" }, { offense: "PROLIFIC", defense: "STAUNCH" }),
    ).toBe(4);
    expect(
      move({ offense: "PROLIFIC", defense: "STAUNCH" }, { offense: "DULL", defense: "INEPT" }),
    ).toBe(-4);
  });

  it("moves the grade and stops at A and F", () => {
    const up = { offense: "PROLIFIC", defense: "STAUNCH" } as const;
    const down = { offense: "DULL", defense: "INEPT" } as const;
    expect(adjustFrontOffice("D", { ...avg }, up).grade).toBe("B");
    expect(adjustFrontOffice("B", avg, up).grade).toBe("A");
    expect(adjustFrontOffice("A", avg, up).grade).toBe("A");
    expect(adjustFrontOffice("B", avg, down).grade).toBe("D");
    expect(adjustFrontOffice("D", avg, down).grade).toBe("F");
    expect(adjustFrontOffice("F", avg, down).grade).toBe("F");
  });
});

describe("training camp run", () => {
  it("changes the grade, logs it and leaves an expansion team alone", () => {
    const result = runTrainingCamp(
      teams(8, {
        1: { previousOffense: "DULL", offenseProfile: "PROLIFIC", frontOfficeGrade: "C" },
      }),
      keep,
    );
    expect(result.results[0].frontOfficeGrade).toBe("A");
    expect(result.results[1].frontOfficeGrade).toBe("C");
    expect(messages(result, "camp-front-office")[0]).toContain(
      "Net +2, Front Office Grade C to A.",
    );
    expect(messages(result, "camp-front-office")[1]).toContain("No change");
  });

  it.each([
    [8, 2, 1],
    [18, 2, 1],
    [19, 4, 2],
    [31, 4, 2],
    [32, 6, 3],
    [43, 6, 3],
    [44, 8, 4],
    [56, 8, 4],
  ])("uses QV and CDV for %i teams", (count, qv, cdv) => {
    const result = runTrainingCamp(teams(count), keep);
    expect(messages(result, "camp-qv-cdv")).toEqual([`${count} teams: QV ${qv}, CDV ${cdv}.`]);
  });

  it("adds base FP for the new grades to what the team has left", () => {
    // T8 is never drawn with 8 teams and a kept order.
    const result = runTrainingCamp(
      teams(8, { 8: { frontOfficeGrade: "B", headCoachGrade: "A", points: 2 } }),
      keep,
    );
    expect(result.results[7].pointsLeft).toBe(5);
    expect(messages(result, "camp-points")[7]).toContain("3 FP added, 5 FP.");
  });

  it("uses the changed grade for the added FP", () => {
    const result = runTrainingCamp(
      teams(8, {
        8: {
          frontOfficeGrade: "B",
          headCoachGrade: "A",
          previousOffense: "DULL",
          offenseProfile: "AVERAGE",
        },
      }),
      keep,
    );
    // B up one grade to A, with a grade A coach: 4 FP.
    expect(result.results[7].frontOfficeGrade).toBe("A");
    expect(result.results[7].pointsLeft).toBe(4);
  });

  it("deals the remaining pairs to teams that already hold profile qualities", () => {
    const result = runTrainingCamp(
      teams(8, {
        1: { offenseQualities: [{ quality: "DYNAMIC", strength: "FULL" }] },
      }),
      keep,
    );
    expect(qualities(result, 1)).toBe(
      "DYNAMIC, RELIABLE, SECURE, DISCIPLINED, EFFICIENT, AGGRESSIVE, ACTIVE, DISCIPLINED",
    );
    expect(messages(result, "camp-offense-qualities")[0]).toBe("Pair #1, RELIABLE: drew T1.");
  });

  it("pays 2 FP to avoid a FULL negative, and the next team takes it", () => {
    const result = runTrainingCamp(teams(8, { 3: { points: 2 } }), keep);
    expect(messages(result, "camp-offense-qualities")).toContain(
      "Pair #1, SHAKY: drew T3. Spends 2 FP to avoid SHAKY, 0 FP left. " +
        "Set aside for the rest of this pair.",
    );
    expect(qualities(result, 3)).not.toContain("SHAKY");
    expect(qualities(result, 4)).toContain("SHAKY");
  });

  it("pays 1 FP to avoid a SEMI negative but not to downgrade a FULL one", () => {
    const result = runTrainingCamp(teams(8, { 3: { points: 1 }, 4: { points: 1 } }), keep);
    const lines = messages(result, "camp-offense-qualities");
    expect(lines.some((line) => line.startsWith("Pair #1, SHAKY: drew T3. Spends"))).toBe(false);
    expect(qualities(result, 3)).toContain("SHAKY");
    expect(lines).toContain(
      "Pair #1, SHAKY•: drew T4. Spends 1 FP to avoid SHAKY•, 0 FP left. " +
        "Set aside for the rest of this pair.",
    );
  });

  it("spends no FP on EFFICIENT and INEFFICIENT", () => {
    const result = runTrainingCamp(
      teams(12, { 9: { points: 5 }, 10: { points: 5 } }),
      seededRng(3),
    );
    expect(messages(result, "camp-efficiency").some((line) => line.includes("Spends"))).toBe(false);
  });

  it("adds grade D and grade F coaches to the INEFFICIENT stack", () => {
    const result = runTrainingCamp(
      teams(20, { 19: { headCoachGrade: "F" }, 20: { headCoachGrade: "D" } }),
      keep,
    );
    const lines = messages(result, "camp-efficiency");
    expect(lines).toContain("Step E: T19 joins the stack with a Head Coach Grade F.");
    expect(lines).toContain("Step E: T20 joins the stack with a Head Coach Grade D.");
    expect(lines.some((line) => line.includes("T18 joins"))).toBe(false);
  });

  it("writes only training camp steps, never leaves FP negative, and repeats from a seed", () => {
    const specs = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [i + 1, { points: i % 4 }]),
    );
    const first = runTrainingCamp(teams(20, specs), seededRng(11));
    const second = runTrainingCamp(teams(20, specs), seededRng(11));
    expect(second).toEqual(first);
    expect(first.log.every((entry) => CAMP_STEPS.includes(entry.step))).toBe(true);
    expect(first.results.every((team) => team.pointsLeft >= 0)).toBe(true);
  });
});
