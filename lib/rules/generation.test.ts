import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/dice";
import { DEFENSE_PAIRS } from "@/lib/reference/defense-tables";
import { OFFENSE_PAIRS } from "@/lib/reference/offense-tables";
import { pairIndexIn } from "@/lib/reference/profile-tables";
import { openDraft } from "@/lib/rules/draft";
import { GENERATION_STEPS, GENERATION_STEP_HEADINGS, generateSeason } from "@/lib/rules/generation";
import { rollManagement, type ManagementInput } from "@/lib/rules/management";
import { draftResults, runOffenseDraft } from "@/lib/rules/offense";

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
      "Step 12: Defense profile",
      "Step 13: Remaining defense qualities",
      "Step 14: Special teams",
    ]);
  });

  it("gives the same league and log for the same seed", () => {
    expect(generateSeason(teams(20), seededRng(77), 2)).toEqual(
      generateSeason(teams(20), seededRng(77), 2),
    );
    expect(generateSeason(teams(20), seededRng(78), 2).log).not.toEqual(
      generateSeason(teams(20), seededRng(77), 2).log,
    );
  });

  it("leaves the management rolls for a seed as they were", () => {
    const alone = rollManagement(teams(12), seededRng(2024));

    const generated = generateSeason(teams(12), seededRng(2024), 2);

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

  it("leaves steps 3 to 11 for a seed as they were before the defense draft", () => {
    // Management, then the offense draft on its own, from one random source.
    const rng = seededRng(909);
    const management = rollManagement(teams(20), rng);
    const draft = openDraft(
      management.teams.map((team, index) => ({
        franchiseId: team.franchiseId,
        teamName: teams(20)[index].teamName,
        headCoachGrade: team.headCoachGrade,
        points: team.basePoints,
      })),
      rng,
    );
    runOffenseDraft(draft);
    const offense = draftResults(draft);
    const before = [...management.log, ...draft.log];

    const generated = generateSeason(teams(20), seededRng(909), 2);

    expect(generated.log.slice(0, before.length)).toEqual(before);
    expect(generated.log[before.length].step).toBe("defense-profile");
    expect(
      generated.teams.map((team) => [team.offenseProfile, team.offenseQualities]),
    ).toEqual(offense.map((team) => [team.offenseProfile, team.offenseQualities]));
  });

  it("reads XP from the column for the league's kick distance", () => {
    const ranges = (distance: 2 | 15) =>
      Array.from({ length: 20 }, (_, seed) =>
        generateSeason(teams(8), seededRng(seed), distance).teams.map((team) => team.xpRange),
      ).flat();

    // 11-56 exists only in the 15-yard column, 11-63 in both.
    expect(ranges(15)).toContain("11-56");
    expect(ranges(2).every((range) => /^11-6[3-6]$/.test(range))).toBe(true);
  });

  it.each([8, 18, 19, 31, 32, 43, 44, 56])(
    "keeps the draft's rules across many seeds in a league of %i",
    (count) => {
      for (let seed = 0; seed < 60; seed++) {
        const { teams: generated, log } = generateSeason(teams(count), seededRng(seed), seed % 2 ? 2 : 15);

        // In log order, steps only move forward.
        const order = log.map((entry) => GENERATION_STEPS.indexOf(entry.step));
        expect(order).toEqual([...order].sort((a, b) => a - b));

        for (const team of generated) {
          const pairs = team.offenseQualities.map((entry) => pairIndexIn(OFFENSE_PAIRS, entry.quality));
          expect(pairs, "one quality per pair, in card order").toEqual(
            [...new Set(pairs)].sort((a, b) => a - b),
          );
          const defensePairs = team.defenseQualities.map((entry) =>
            pairIndexIn(DEFENSE_PAIRS, entry.quality),
          );
          expect(defensePairs, "one defense quality per pair, in card order").toEqual(
            [...new Set(defensePairs)].sort((a, b) => a - b),
          );
          expect(team.fgRange).toMatch(/^11-[4-6][1-6]$/);
          expect(team.xpRange).toMatch(seed % 2 ? /^11-6[3-6]$/ : /^11-(56|6[1-6])$/);

          // Every point a team was given is either spent or lost, and its
          // balance never goes below zero on the way.
          const lines = log
            .filter((entry) => entry.franchiseId === team.franchiseId)
            .map((entry) => entry.message);
          const total = (pattern: RegExp) =>
            lines.reduce((sum, line) => sum + Number(pattern.exec(line)?.[1] ?? 0), 0);
          expect(total(/Spends (\d) FP/) + total(/: (\d) FP unused and lost\.$/)).toBe(
            team.basePoints,
          );
          const balances = lines.map((line) => / (-?\d+) FP left\./.exec(line)?.[1]);
          expect(balances.every((left) => left === undefined || Number(left) >= 0)).toBe(true);
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

        const defended = (profile: string) =>
          generated.filter((team) => team.defenseProfile === profile).length;
        expect(defended("STAUNCH")).toBe(cdv);
        expect(defended("STAUNCH_SEMI")).toBe(cdv);
        expect(defended("INEPT")).toBeLessThanOrEqual(cdv);
        expect(defended("INEPT_SEMI")).toBeLessThanOrEqual(cdv);
      }
    },
  );

  it("spends Franchise Points somewhere across the seeds", () => {
    const spends = Array.from({ length: 30 }, (_, seed) =>
      generateSeason(teams(16), seededRng(seed), 2).log.filter((entry) =>
        entry.message.includes("Spends"),
      ),
    ).flat();

    expect(spends.length).toBeGreaterThan(0);
    expect(spends.some((entry) => entry.step === "offense-profile")).toBe(true);
    expect(spends.some((entry) => entry.step === "offense-qualities")).toBe(true);
    expect(spends.some((entry) => entry.step === "defense-profile")).toBe(true);
    expect(spends.some((entry) => entry.step === "special-teams")).toBe(true);
  });
});
