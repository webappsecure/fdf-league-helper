import { describe, expect, it } from "vitest";
import { seededRng, type Rng } from "@/lib/dice";
import type { Grade } from "@/lib/reference/management-tables";
import { OFFENSE_PAIRS, qualityLabel } from "@/lib/reference/offense-tables";
import { pairIndexIn } from "@/lib/reference/profile-tables";
import { openDraft, type Draft, type DraftTeam } from "@/lib/rules/draft";
import {
  draftEfficiency,
  draftProfiles,
  draftRemainingQualities,
  draftResults,
  runOffenseDraft,
} from "@/lib/rules/offense";

// Just under 1: a shuffle keeps its order and a die shows 6.
const KEEP = 0.9999;

// Replays the given values, then keeps every later shuffle in order.
function script(...values: number[]): Rng {
  let next = 0;
  return () => values[next++] ?? KEEP;
}

// The values that keep a shuffle of this many cards in order.
function keep(cards: number): number[] {
  return Array<number>(cards - 1).fill(KEEP);
}

function roll(first: number, second: number): number[] {
  return [(first - 0.5) / 6, (second - 0.5) / 6];
}

// Teams named T1, T2 and so on. `points` and `grades` are keyed by number.
function teams(
  count: number,
  points: Record<number, number> = {},
  grades: Record<number, Grade> = {},
): DraftTeam[] {
  return Array.from({ length: count }, (_, index) => ({
    franchiseId: index + 1,
    teamName: `T${index + 1}`,
    headCoachGrade: grades[index + 1] ?? "C",
    points: points[index + 1] ?? 0,
  }));
}

// Each team as "profile: qualities (FP left)", keyed by name.
function summary(draft: Draft): Record<string, string> {
  return Object.fromEntries(
    draftResults(draft).map((team) => [
      `T${team.franchiseId}`,
      `${team.offenseProfile}: ${team.offenseQualities.map(qualityLabel).join(", ")} ` +
        `(${team.pointsLeft})`,
    ]),
  );
}

function messages(draft: Draft): string[] {
  return draft.log.map((entry) => entry.message);
}

describe("offense profile (step 9)", () => {
  it("draws one team per profile and one more for each footnote", () => {
    const draft = openDraft(
      teams(8),
      script(
        ...keep(8),
        ...roll(1, 1),
        ...keep(6),
        ...roll(4, 4),
        ...keep(5),
        ...roll(6, 1),
        ...keep(3),
        ...roll(2, 2),
      ),
    );

    draftProfiles(draft);

    expect(summary(draft)).toEqual({
      T1: "PROLIFIC:  (0)",
      T2: "AVERAGE: DYNAMIC•, SOLID• (0)",
      T3: "PROLIFIC_SEMI: DYNAMIC, SOLID (0)",
      T4: "DULL: POROUS• (0)",
      T5: "AVERAGE: ERRATIC• (0)",
      T6: "DULL_SEMI: POROUS• (0)",
      T7: "AVERAGE: ERRATIC• (0)",
      T8: "AVERAGE:  (0)",
    });
    expect(messages(draft)).toEqual([
      "Step A, PROLIFIC: drew T1. Roll 1-1: PROLIFIC, footnote a.",
      "Step A, PROLIFIC, footnote a: drew T2, who receives DYNAMIC•, SOLID•.",
      "Step B, PROLIFIC•: drew T3. Roll 4-4: PROLIFIC•, DYNAMIC, SOLID.",
      "Step C, DULL: drew T4. Roll 1-6: DULL, POROUS•, footnote e.",
      "Step C, DULL, footnote e: drew T5, who receives ERRATIC•.",
      "Step D, DULL•: drew T6. Roll 2-2: DULL•, POROUS•, footnote e.",
      "Step D, DULL•, footnote e: drew T7, who receives ERRATIC•.",
    ]);
    expect(draft.log.map((entry) => entry.franchiseId)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(draft.log.every((entry) => entry.step === "offense-profile")).toBe(true);
  });

  it("draws CDV teams per profile in a larger league", () => {
    // Every roll is 6-6, which has a footnote only in the DULL columns.
    const draft = openDraft(teams(19), script());

    draftProfiles(draft);

    const profiles = draftResults(draft).map((team) => team.offenseProfile);
    expect(profiles.slice(0, 8)).toEqual([
      "PROLIFIC",
      "PROLIFIC",
      "PROLIFIC_SEMI",
      "PROLIFIC_SEMI",
      "DULL",
      "DULL",
      "AVERAGE",
      "AVERAGE",
    ]);
    expect(profiles.filter((profile) => profile === "DULL_SEMI")).toHaveLength(2);
    expect(summary(draft).T7).toBe("AVERAGE: ERRATIC•, POROUS• (0)");
  });

  it("pays 2 FP to avoid a DULL profile and returns to the pool", () => {
    const draft = openDraft(
      teams(8, { 4: 2 }),
      script(...keep(8), ...roll(3, 5), ...keep(7), ...roll(4, 4), ...keep(6), ...roll(3, 5)),
    );

    draftProfiles(draft);

    expect(summary(draft).T3).toBe("DULL: ERRATIC•, POROUS (0)");
    expect(summary(draft).T4).toBe("AVERAGE:  (0)");
    expect(summary(draft).T5).toBe("DULL_SEMI: SOLID• (0)");
    expect(messages(draft).slice(2, 5)).toEqual([
      "Step C, DULL: drew T3. Roll 3-5: DULL, ERRATIC•, POROUS.",
      "Step D, DULL•: drew T4. Spends 2 FP to avoid a DULL• profile, 0 FP left. " +
        "The card is shuffled back in.",
      "Step D, DULL•: drew T5. Roll 6-6: DULL•, SOLID•, footnote d.",
    ]);
  });

  it("can draw a team again after it paid to avoid", () => {
    // T3 avoids DULL. In step D the four teams ahead of it avoid in turn, and
    // T3, now out of FP, is drawn again and takes DULL•. Its footnote d then
    // goes to T5, which has nothing left to avoid it with.
    const draft = openDraft(
      teams(8, { 3: 2, 5: 2, 6: 2, 7: 2, 8: 2 }),
      script(...keep(8), ...roll(3, 5), ...keep(7), ...roll(4, 4), ...keep(6), ...keep(5), ...roll(3, 5)),
    );

    draftProfiles(draft);

    expect(summary(draft)).toEqual({
      T1: "PROLIFIC: DYNAMIC•, SOLID (0)",
      T2: "PROLIFIC_SEMI: DYNAMIC, SOLID (0)",
      T3: "DULL_SEMI: SOLID• (0)",
      T4: "DULL: ERRATIC•, POROUS (0)",
      T5: "AVERAGE: ERRATIC•, POROUS• (0)",
      T6: "AVERAGE:  (0)",
      T7: "AVERAGE:  (0)",
      T8: "AVERAGE:  (0)",
    });
    expect(draft.log.filter((entry) => entry.franchiseId === 3).map((entry) => entry.message)).toEqual([
      "Step C, DULL: drew T3. Spends 2 FP to avoid a DULL profile, 0 FP left. " +
        "The card is shuffled back in.",
      "Step D, DULL•: drew T3. Roll 6-6: DULL•, SOLID•, footnote d.",
    ]);
  });

  it("gives a DULL profile to a team that cannot afford to avoid it", () => {
    const draft = openDraft(
      teams(8, { 3: 1 }),
      script(...keep(8), ...roll(3, 5), ...keep(7), ...roll(4, 4), ...keep(6), ...roll(3, 5)),
    );

    draftProfiles(draft);

    expect(summary(draft).T3).toBe("DULL: ERRATIC•, POROUS (1)");
  });

  it.each([
    ["d", [1, 1], 2, "AVERAGE:  (0)", "ERRATIC•, POROUS•", 2],
    ["e", [1, 5], 1, "AVERAGE:  (0)", "ERRATIC•", 1],
    ["f", [2, 2], 3, "AVERAGE:  (2)", "POROUS•", 1],
  ] as const)(
    "pays to avoid footnote %s and passes it to the next team",
    (note, dice, points, avoider, award, cost) => {
      const draft = openDraft(
        teams(8, { 4: points }),
        script(...keep(8), ...roll(3, 5), ...keep(7), ...roll(4, 4), ...keep(6), ...roll(dice[0], dice[1])),
      );

      draftProfiles(draft);

      expect(summary(draft).T4).toBe(avoider);
      expect(summary(draft).T5).toBe(`AVERAGE: ${award} (0)`);
      expect(messages(draft)).toContain(
        `Step C, DULL, footnote ${note}: drew T4. Spends ${cost} FP to avoid ${award}, ` +
          `${points - cost} FP left. Set aside for the rest of step 9.`,
      );
      // Set aside: T4 is not drawn in step D, where T6 is next.
      expect(summary(draft).T6.startsWith("DULL_SEMI")).toBe(true);
    },
  );

  it("takes both qualities of footnote d with only 1 FP", () => {
    const draft = openDraft(
      teams(8, { 4: 1 }),
      script(...keep(8), ...roll(3, 5), ...keep(7), ...roll(4, 4), ...keep(6), ...roll(1, 1)),
    );

    draftProfiles(draft);

    expect(summary(draft).T4).toBe("AVERAGE: ERRATIC•, POROUS• (1)");
  });

  it("never charges for a positive footnote", () => {
    const draft = openDraft(teams(8, { 2: 4 }), script(...keep(8), ...roll(1, 1)));

    draftProfiles(draft);

    expect(summary(draft).T2).toBe("AVERAGE: DYNAMIC•, SOLID• (4)");
  });

  it("ends a sub-step with nobody assigned when the pool runs out", () => {
    const rich = { 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4 };
    const draft = openDraft(teams(8, rich), script(...keep(8), ...roll(3, 5), ...keep(7), ...roll(4, 4)));

    draftProfiles(draft);

    const results = draftResults(draft);
    expect(results.map((team) => team.offenseProfile).slice(2)).toEqual(Array(6).fill("AVERAGE"));
    expect(results.map((team) => team.pointsLeft)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    const ends = draft.log.filter((entry) => entry.franchiseId === null);
    expect(ends.map((entry) => entry.message)).toEqual([
      "Step C, DULL: no teams remain to draw.",
      "Step D, DULL•: no teams remain to draw.",
    ]);
  });

  it("logs a footnote that finds no team left", () => {
    // Three teams is below any real league, but it empties the pool quickly.
    const draft = openDraft(teams(3), script(...keep(3), ...roll(1, 1), ...roll(1, 1)));

    draftProfiles(draft);

    expect(messages(draft)).toEqual([
      "Step A, PROLIFIC: drew T1. Roll 1-1: PROLIFIC, footnote a.",
      "Step A, PROLIFIC, footnote a: drew T2, who receives DYNAMIC•, SOLID•.",
      "Step B, PROLIFIC•: drew T3. Roll 1-1: PROLIFIC•, POROUS•, footnote a.",
      "Step B, PROLIFIC•, footnote a: no teams remain to draw.",
      "Step C, DULL: no teams remain to draw.",
      "Step D, DULL•: no teams remain to draw.",
    ]);
  });
});

describe("remaining offense qualities (step 10)", () => {
  it("gives each slot of each pair to one team when nobody has FP", () => {
    const draft = openDraft(teams(8), script());

    draftRemainingQualities(draft);

    expect(summary(draft)).toEqual({
      T1: "AVERAGE: RELIABLE, SECURE, DISCIPLINED (0)",
      T2: "AVERAGE: RELIABLE•, SECURE•, DISCIPLINED• (0)",
      T3: "AVERAGE: SHAKY, CLUMSY, UNDISCIPLINED (0)",
      T4: "AVERAGE: SHAKY•, CLUMSY•, UNDISCIPLINED• (0)",
      T5: "AVERAGE:  (0)",
      T6: "AVERAGE:  (0)",
      T7: "AVERAGE:  (0)",
      T8: "AVERAGE:  (0)",
    });
    expect(messages(draft).slice(0, 5)).toEqual([
      "Pair #1, RELIABLE: drew T1.",
      "Pair #1, RELIABLE•: drew T2.",
      "Pair #1, SHAKY: drew T3.",
      "Pair #1, SHAKY•: drew T4.",
      "Pair #2, SECURE: drew T1.",
    ]);
    expect(draft.log.every((entry) => entry.step === "offense-qualities")).toBe(true);
  });

  it("draws CDV teams for every slot in a larger league", () => {
    const draft = openDraft(teams(19), seededRng(3));

    draftRemainingQualities(draft);

    const held = draftResults(draft).flatMap((team) => team.offenseQualities.map(qualityLabel));
    for (const name of ["RELIABLE", "RELIABLE•", "SHAKY", "SHAKY•", "CLUMSY•", "UNDISCIPLINED"]) {
      expect(held.filter((label) => label === name), name).toHaveLength(2);
    }
    for (const team of draftResults(draft)) {
      const pairs = team.offenseQualities.map((entry) => pairIndexIn(OFFENSE_PAIRS, entry.quality));
      expect(new Set(pairs).size).toBe(pairs.length);
    }
  });

  it("pays 2 FP for a full negative and 1 FP for a semi negative", () => {
    const draft = openDraft(teams(8, { 3: 2, 5: 1 }), script());

    draftRemainingQualities(draft);

    // Pair 1: T3 avoids SHAKY, T4 takes it, T5 avoids SHAKY•, T6 takes it.
    // Later pairs find T3 and T5 out of FP.
    expect(summary(draft)).toMatchObject({
      T3: "AVERAGE: CLUMSY, UNDISCIPLINED (0)",
      T4: "AVERAGE: SHAKY, CLUMSY•, UNDISCIPLINED• (0)",
      T5: "AVERAGE:  (0)",
      T6: "AVERAGE: SHAKY• (0)",
    });
    expect(messages(draft).slice(2, 6)).toEqual([
      "Pair #1, SHAKY: drew T3. Spends 2 FP to avoid SHAKY, 0 FP left. " +
        "Set aside for the rest of this pair.",
      "Pair #1, SHAKY: drew T4.",
      "Pair #1, SHAKY•: drew T5. Spends 1 FP to avoid SHAKY•, 0 FP left. " +
        "Set aside for the rest of this pair.",
      "Pair #1, SHAKY•: drew T6.",
    ]);
  });

  it("gives a full negative to a team with 1 FP, which cannot turn it into a semi", () => {
    const draft = openDraft(teams(8, { 3: 1 }), script());

    draftRemainingQualities(draft);

    expect(summary(draft).T3).toBe("AVERAGE: SHAKY, CLUMSY, UNDISCIPLINED (1)");
  });

  it("spends only what step 9 left", () => {
    // T3 has 3 FP: 2 go on avoiding DULL in step 9, leaving 1, too few to
    // avoid SHAKY in step 10.
    const draft = openDraft(
      teams(8, { 3: 3 }),
      script(...keep(8), ...roll(3, 5), ...keep(7), ...roll(4, 4), ...keep(6), ...keep(5), ...roll(3, 5)),
    );

    draftProfiles(draft);
    draftRemainingQualities(draft);

    const t3 = draftResults(draft)[2];
    expect(t3.pointsLeft).toBe(1);
    expect(t3.offenseQualities.map(qualityLabel)).toContain("SHAKY");
  });

  it("ends a pair when every team has been drawn", () => {
    const draft = openDraft(teams(8, { 3: 6, 4: 6, 5: 6, 6: 6, 7: 6, 8: 6 }), script());

    draftRemainingQualities(draft);

    expect(messages(draft).filter((line) => line.includes("no teams remain"))).toEqual([
      "Pair #1, SHAKY: no teams remain to draw.",
      "Pair #2, CLUMSY: no teams remain to draw.",
      "Pair #3, UNDISCIPLINED: no teams remain to draw.",
    ]);
    expect(draftResults(draft).map((team) => team.pointsLeft)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("EFFICIENT and INEFFICIENT (step 11)", () => {
  it("deals QV teams to each of the four qualities", () => {
    const draft = openDraft(teams(8, { 1: 4, 5: 4 }), script());

    draftEfficiency(draft);

    expect(summary(draft)).toEqual({
      T1: "AVERAGE: EFFICIENT (4)",
      T2: "AVERAGE: EFFICIENT (0)",
      T3: "AVERAGE: EFFICIENT• (0)",
      T4: "AVERAGE: EFFICIENT• (0)",
      T5: "AVERAGE: INEFFICIENT (4)",
      T6: "AVERAGE: INEFFICIENT (0)",
      T7: "AVERAGE: INEFFICIENT• (0)",
      T8: "AVERAGE: INEFFICIENT• (0)",
    });
    expect(draft.log.every((entry) => entry.step === "efficiency")).toBe(true);
  });

  it("adds grade A coaches to the EFFICIENT stack and grade D to the INEFFICIENT one", () => {
    // After the first shuffle of 12, the stack shuffle's first swap brings its
    // last card, the grade A team T9, to the front.
    const draft = openDraft(
      teams(12, {}, { 2: "A", 9: "A", 6: "D", 12: "D" }),
      script(...keep(12), 0),
    );

    draftEfficiency(draft);

    expect(summary(draft)).toMatchObject({
      T9: "AVERAGE: EFFICIENT (0)",
      T2: "AVERAGE: EFFICIENT (0)",
      T3: "AVERAGE: EFFICIENT• (0)",
      T4: "AVERAGE: EFFICIENT• (0)",
      T1: "AVERAGE: INEFFICIENT (0)",
      T5: "AVERAGE: INEFFICIENT (0)",
      T6: "AVERAGE: INEFFICIENT• (0)",
      T7: "AVERAGE: INEFFICIENT• (0)",
      T12: "AVERAGE:  (0)",
    });
    expect(messages(draft)).toEqual([
      "Step A: drew T1.",
      "Step A: drew T2.",
      "Step A: drew T3.",
      "Step A: drew T4.",
      "Step B: T9 joins the stack with a Head Coach Grade A.",
      "Step B: T9 receives EFFICIENT.",
      "Step B: T2 receives EFFICIENT.",
      "Step C: T3 receives EFFICIENT•.",
      "Step C: T4 receives EFFICIENT•.",
      "Step D: drew T1.",
      "Step D: drew T5.",
      "Step D: drew T6.",
      "Step D: drew T7.",
      "Step E: T12 joins the stack with a Head Coach Grade D.",
      "Step E: T1 receives INEFFICIENT.",
      "Step E: T5 receives INEFFICIENT.",
      "Step F: T6 receives INEFFICIENT•.",
      "Step F: T7 receives INEFFICIENT•.",
    ]);
  });

  it.each([8, 19, 32, 44, 56])(
    "keeps efficient teams out of the INEFFICIENT draw in a league of %i",
    (count) => {
      for (let seed = 0; seed < 25; seed++) {
        const grades = Object.fromEntries(
          Array.from({ length: count }, (_, index) => [index + 1, "ABCD"[(index + seed) % 4] as Grade]),
        );
        const draft = openDraft(teams(count, {}, grades), seededRng(seed));

        draftEfficiency(draft);

        const held = draftResults(draft).map((team) => team.offenseQualities.map(qualityLabel));
        expect(held.every((labels) => labels.length <= 1)).toBe(true);
        for (const name of ["EFFICIENT", "EFFICIENT•", "INEFFICIENT", "INEFFICIENT•"]) {
          expect(held.filter((labels) => labels[0] === name), name).toHaveLength(draft.qv);
        }
      }
    },
  );
});

describe("runOffenseDraft", () => {
  it("logs QV and CDV first, with no team", () => {
    const draft = openDraft(teams(19), seededRng(1));

    runOffenseDraft(draft);

    const { log } = draft;

    expect(log[0]).toEqual({
      step: "qv-cdv",
      franchiseId: null,
      message: "19 teams: QV 4, CDV 2.",
    });
    expect([...new Set(log.map((entry) => entry.step))]).toEqual([
      "qv-cdv",
      "offense-profile",
      "offense-qualities",
      "efficiency",
    ]);
  });
});
