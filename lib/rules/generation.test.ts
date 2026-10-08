import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/dice";
import { pairIndex } from "@/lib/reference/offense-tables";
import { GENERATION_STEPS, GENERATION_STEP_HEADINGS, generateSeason } from "@/lib/rules/generation";
import { rollManagement, type ManagementInput } from "@/lib/rules/management";

function teams(count: number): ManagementInput[] {
  return Array.from({ length: count }, (_, index) => ({
    franchiseId: index + 1,
    teamName: `Team ${index + 1}`,
    coachName: `Coach ${index + 1}`,
  }));
}

describe("generateSeason", () => {
  it("lists the steps in rulebook order with a heading each", () => {
    expect(GENERATION_STEPS.map((step) => GENERATION_STEP_HEADINGS[step])).toEqual([
      "Step 3: Ownership",
      "Step 4: Front office grade",
      "Step 6: Head coach grade",
      "Step 7: Franchise Points",
      "Step 8: QV and CDV",
      "Step 9: Offense profile",
      "Step 10: Remaining offense qualities",
      "Step 11: EFFICIENT and INEFFICIENT",
    ]);
  });

  it("gives the same league and log for the same seed", () => {
    expect(generateSeason(teams(20), seededRng(77))).toEqual(
      generateSeason(teams(20), seededRng(77)),
    );
    expect(generateSeason(teams(20), seededRng(78)).log).not.toEqual(
      generateSeason(teams(20), seededRng(77)).log,
    );
  });

  it("leaves the management rolls for a seed as they were", () => {
    const alone = rollManagement(teams(12), seededRng(2024));

    const generated = generateSeason(teams(12), seededRng(2024));

    expect(
      generated.teams.map((team) => ({
        franchiseId: team.franchiseId,
        ownershipStyle: team.ownershipStyle,
        ownershipLoyalty: team.ownershipLoyalty,
        frontOfficeGrade: team.frontOfficeGrade,
        headCoachGrade: team.headCoachGrade,
        basePoints: team.basePoints,
      })),
    ).toEqual(alone.teams);
    expect(generated.log.slice(0, alone.log.length)).toEqual(alone.log);
    expect(generated.log[alone.log.length].step).toBe("qv-cdv");
  });

  it.each([8, 18, 19, 31, 32, 43, 44, 56])(
    "keeps the draft's rules across many seeds in a league of %i",
    (count) => {
      for (let seed = 0; seed < 60; seed++) {
        const { teams: generated, log } = generateSeason(teams(count), seededRng(seed));

        // In log order, steps only move forward.
        const order = log.map((entry) => GENERATION_STEPS.indexOf(entry.step));
        expect(order).toEqual([...order].sort((a, b) => a - b));

        for (const team of generated) {
          const pairs = team.offenseQualities.map((entry) => pairIndex(entry.quality));
          expect(pairs, "one quality per pair, in card order").toEqual(
            [...new Set(pairs)].sort((a, b) => a - b),
          );
          expect(team.pointsLeft).toBeGreaterThanOrEqual(0);

          const spent = log
            .filter((entry) => entry.franchiseId === team.franchiseId)
            .map((entry) => /Spends (\d) FP/.exec(entry.message))
            .reduce((total, match) => total + (match ? Number(match[1]) : 0), 0);
          expect(spent).toBe(team.basePoints - team.pointsLeft);
        }

        // Each drafted profile goes to at most CDV teams, and the prolific
        // ones, which nobody avoids, to exactly CDV.
        const cdv = count <= 18 ? 1 : count <= 31 ? 2 : count <= 43 ? 3 : 4;
        const profiled = (profile: string) =>
          generated.filter((team) => team.offenseProfile === profile).length;
        expect(profiled("PROLIFIC")).toBe(cdv);
        expect(profiled("PROLIFIC_SEMI")).toBe(cdv);
        expect(profiled("DULL")).toBeLessThanOrEqual(cdv);
        expect(profiled("DULL_SEMI")).toBeLessThanOrEqual(cdv);
      }
    },
  );

  it("spends Franchise Points somewhere across the seeds", () => {
    const spends = Array.from({ length: 30 }, (_, seed) =>
      generateSeason(teams(16), seededRng(seed)).log.filter((entry) =>
        entry.message.includes("Spends"),
      ),
    ).flat();

    expect(spends.length).toBeGreaterThan(0);
    expect(spends.some((entry) => entry.step === "offense-profile")).toBe(true);
    expect(spends.some((entry) => entry.step === "offense-qualities")).toBe(true);
  });
});
