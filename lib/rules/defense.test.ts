import { describe, expect, it } from "vitest";
import type { Rng } from "@/lib/dice";
import { TABLE_D } from "@/lib/reference/defense-tables";
import {
  DRAFT_PROFILES,
  FOOTNOTE_AWARDS,
  OFFENSE_PAIRS,
  PROFILE_LABELS,
  type DraftProfile,
  type OffenseQuality,
} from "@/lib/reference/offense-tables";
import { qualityLabel } from "@/lib/reference/profile-tables";
import {
  defenseResults,
  draftDefenseProfiles,
  draftRemainingDefenseQualities,
  runDefenseDraft,
} from "@/lib/rules/defense";
import { openDraft, type Draft, type DraftTeam, type Side } from "@/lib/rules/draft";
import { draftProfiles, draftResults } from "@/lib/rules/offense";

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

// Teams named T1, T2 and so on, with Franchise Points keyed by number.
function teams(count: number, points: Record<number, number> = {}): DraftTeam[] {
  return Array.from({ length: count }, (_, index) => ({
    franchiseId: index + 1,
    teamName: `T${index + 1}`,
    headCoachGrade: "C",
    points: points[index + 1] ?? 0,
  }));
}

// Each team as "profile: qualities (FP left)", keyed by name.
function summary(draft: Draft): Record<string, string> {
  return Object.fromEntries(
    defenseResults(draft).map((team, index) => [
      `T${team.franchiseId}`,
      `${team.defenseProfile}: ${team.defenseQualities.map(qualityLabel).join(", ")} ` +
        `(${draft.cards[index].points})`,
    ]),
  );
}

function messages(draft: Draft): string[] {
  return draft.log.map((entry) => entry.message);
}

// Steps A and B with no footnotes, so step C starts with T3 on top of six.
const PLAIN_START = [...keep(8), ...roll(6, 6), ...keep(7), ...roll(6, 6), ...keep(6)];

describe("defense profile (step 12)", () => {
  it("draws one team per profile and one more for each footnote", () => {
    const draft = openDraft(
      teams(8),
      script(
        ...keep(8),
        ...roll(1, 1),
        ...keep(6),
        ...roll(6, 6),
        ...keep(5),
        ...roll(2, 5),
        ...keep(3),
        ...roll(3, 3),
      ),
    );

    draftDefenseProfiles(draft);

    expect(summary(draft)).toEqual({
      T1: "STAUNCH:  (0)",
      T2: "AVERAGE: STIFF•, PUNISHING• (0)",
      T3: "STAUNCH_SEMI: STIFF, PUNISHING (0)",
      T4: "INEPT: MILD (0)",
      T5: "AVERAGE: SOFT• (0)",
      T6: "INEPT_SEMI: MILD• (0)",
      T7: "AVERAGE: SOFT• (0)",
      T8: "AVERAGE:  (0)",
    });
    expect(messages(draft)).toEqual([
      "Step A, STAUNCH: drew T1. Roll 1-1: STAUNCH, footnote a.",
      "Step A, STAUNCH, footnote a: drew T2, who receives STIFF•, PUNISHING•.",
      "Step B, STAUNCH•: drew T3. Roll 6-6: STAUNCH•, STIFF, PUNISHING.",
      "Step C, INEPT: drew T4. Roll 2-5: INEPT, MILD, footnote e.",
      "Step C, INEPT, footnote e: drew T5, who receives SOFT•.",
      "Step D, INEPT•: drew T6. Roll 3-3: INEPT•, MILD•, footnote e.",
      "Step D, INEPT•, footnote e: drew T7, who receives SOFT•.",
    ]);
    expect(draft.log.every((entry) => entry.step === "defense-profile")).toBe(true);
  });

  it("pays 2 FP to avoid an INEPT profile and returns to the pool", () => {
    const draft = openDraft(teams(8, { 3: 2 }), script(...PLAIN_START));

    draftDefenseProfiles(draft);

    // T3 avoids, T4 takes INEPT with a 6-6 and no footnote. T3 is shuffled
    // back behind T5 to T8, so T5 takes INEPT•.
    expect(summary(draft)).toMatchObject({
      T3: "AVERAGE:  (0)",
      T4: "INEPT: SOFT, MILD (0)",
      T5: "INEPT_SEMI: SOFT, MILD (0)",
    });
    expect(messages(draft)[2]).toBe(
      "Step C, INEPT: drew T3. Spends 2 FP to avoid an INEPT profile, 0 FP left. " +
        "The card is shuffled back in.",
    );
  });

  it("gives an INEPT profile to a team that cannot afford to avoid it", () => {
    const draft = openDraft(teams(8, { 3: 1 }), script(...PLAIN_START));

    draftDefenseProfiles(draft);

    expect(summary(draft).T3).toBe("INEPT: SOFT, MILD (1)");
  });

  it.each([
    ["d", [1, 1], 2, "SOFT•, MILD•", 2],
    ["f", [1, 3], 1, "MILD•", 1],
    ["e", [2, 5], 1, "SOFT•", 1],
  ] as const)("pays to avoid footnote %s and passes it on", (note, dice, points, award, cost) => {
    const draft = openDraft(
      teams(8, { 4: points }),
      script(...PLAIN_START, ...roll(dice[0], dice[1])),
    );

    draftDefenseProfiles(draft);

    expect(summary(draft).T4).toBe("AVERAGE:  (0)");
    expect(summary(draft).T5).toBe(`AVERAGE: ${award} (0)`);
    expect(messages(draft)).toContain(
      `Step C, INEPT, footnote ${note}: drew T4. Spends ${cost} FP to avoid ${award}, ` +
        "0 FP left. Set aside for the rest of step 12.",
    );
  });

  it("takes both qualities of footnote d with only 1 FP", () => {
    const draft = openDraft(teams(8, { 4: 1 }), script(...PLAIN_START, ...roll(1, 1)));

    draftDefenseProfiles(draft);

    expect(summary(draft).T4).toBe("AVERAGE: SOFT•, MILD• (1)");
  });
});

describe("remaining defense qualities (step 13)", () => {
  it("gives each slot of each pair to one team when nobody has FP", () => {
    const draft = openDraft(teams(8), script());

    draftRemainingDefenseQualities(draft);

    expect(summary(draft)).toMatchObject({
      T1: "AVERAGE: AGGRESSIVE, ACTIVE, DISCIPLINED (0)",
      T2: "AVERAGE: AGGRESSIVE•, ACTIVE•, DISCIPLINED• (0)",
      T3: "AVERAGE: MEEK, PASSIVE, UNDISCIPLINED (0)",
      T4: "AVERAGE: MEEK•, PASSIVE•, UNDISCIPLINED• (0)",
      T5: "AVERAGE:  (0)",
    });
    expect(messages(draft).slice(0, 5)).toEqual([
      "Pair #1, AGGRESSIVE: drew T1.",
      "Pair #1, AGGRESSIVE•: drew T2.",
      "Pair #1, MEEK: drew T3.",
      "Pair #1, MEEK•: drew T4.",
      "Pair #2, ACTIVE: drew T1.",
    ]);
    expect(draft.log.every((entry) => entry.step === "defense-qualities")).toBe(true);
  });

  it("pays 2 FP for a full negative and 1 FP for a semi negative", () => {
    const draft = openDraft(teams(8, { 3: 2, 5: 1 }), script());

    draftRemainingDefenseQualities(draft);

    expect(summary(draft)).toMatchObject({
      T3: "AVERAGE: PASSIVE, UNDISCIPLINED (0)",
      T4: "AVERAGE: MEEK, PASSIVE•, UNDISCIPLINED• (0)",
      T5: "AVERAGE:  (0)",
      T6: "AVERAGE: MEEK• (0)",
    });
    expect(messages(draft)).toContain(
      "Pair #1, MEEK•: drew T5. Spends 1 FP to avoid MEEK•, 0 FP left. " +
        "Set aside for the rest of this pair.",
    );
  });

  it("gives a full negative to a team with only 1 FP", () => {
    const draft = openDraft(teams(8, { 3: 1 }), script());

    draftRemainingDefenseQualities(draft);

    expect(summary(draft).T3).toBe("AVERAGE: MEEK, PASSIVE, UNDISCIPLINED (1)");
  });
});

describe("a side of the ball", () => {
  it("cannot be wired to the other side's table", () => {
    const offenseWithTableD: Side<DraftProfile, OffenseQuality> = {
      of: (card) => card.offense,
      profileStep: "offense-profile",
      qualitiesStep: "offense-qualities",
      profileStepNumber: 9,
      profiles: DRAFT_PROFILES,
      labels: PROFILE_LABELS,
      // @ts-expect-error Table D holds defense profiles and qualities.
      table: TABLE_D,
      footnoteAwards: FOOTNOTE_AWARDS,
      remainingPairs: OFFENSE_PAIRS.slice(2, 5),
    };
    const offenseOnDefense: Side<DraftProfile, OffenseQuality> = {
      ...offenseWithTableD,
      // @ts-expect-error The defense part of a card holds defense values.
      of: (card) => card.defense,
    };

    // The assertions are the two compiler errors above, checked by the build.
    expect(offenseOnDefense.profileStepNumber).toBe(9);
  });
});

describe("defense after offense", () => {
  it("cannot spend Franchise Points the offense draft already used", () => {
    // T3 has 2 FP and spends them avoiding DULL in step 9, so in step 12 it
    // has nothing left to avoid INEPT with.
    const draft = openDraft(
      teams(8, { 3: 2 }),
      script(...PLAIN_START, ...keep(5), ...roll(6, 6), ...keep(4), ...roll(6, 6), ...PLAIN_START),
    );

    draftProfiles(draft);
    const offenseBefore = draftResults(draft);
    expect(offenseBefore[2].pointsLeft).toBe(0);
    runDefenseDraft(draft);

    expect(summary(draft).T3.startsWith("INEPT: SOFT, MILD")).toBe(true);
    // The defense draft leaves every team's offense as it was.
    expect(draftResults(draft)).toEqual(offenseBefore);
    expect(draft.log.filter((entry) => entry.message.includes("Spends"))).toHaveLength(1);
  });
});
