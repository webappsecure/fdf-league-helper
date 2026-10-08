import { describe, expect, it } from "vitest";
import type { Rng } from "@/lib/dice";
import { openDraft, type Draft, type DraftTeam } from "@/lib/rules/draft";
import { rollSpecialTeams } from "@/lib/rules/special-teams";

// A random source that makes the dice show the given faces, two per roll.
// Asking for more throws, so every test accounts for each roll it makes.
function dice(...rolls: [number, number][]): Rng {
  const faces = rolls.flat();
  let next = 0;
  return () => {
    if (next >= faces.length) throw new Error("rolled more dice than the script holds");
    return (faces[next++] - 0.5) / 6;
  };
}

function team(franchiseId: number, points = 0): DraftTeam {
  return { franchiseId, teamName: `T${franchiseId}`, headCoachGrade: "C", points };
}

function messages(draft: Draft): string[] {
  return draft.log.map((entry) => entry.message);
}

describe("special teams (step 14)", () => {
  it("rolls kickoff return, punt return, FG and XP for each team in turn", () => {
    const draft = openDraft(
      [team(1), team(2)],
      dice([5, 4], [1, 1], [1, 1], [1, 1], [6, 6], [6, 3], [2, 3], [5, 5]),
    );

    expect(rollSpecialTeams(draft, 2)).toEqual([
      { kickReturn: "ELECTRIC_SEMI", puntReturn: null, fgRange: "11-45", xpRange: "11-63" },
      { kickReturn: "ELECTRIC", puntReturn: "ELECTRIC_SEMI", fgRange: "11-53", xpRange: "11-66" },
    ]);
    expect(messages(draft)).toEqual([
      "T1: Kickoff return roll 4-5, ELECTRIC•.",
      "T1: Punt return roll 1-1, no quality.",
      "T1: FG roll 1-1, 11-45.",
      "T1: XP roll 1-1, 11-63.",
      "T2: Kickoff return roll 6-6, ELECTRIC.",
      "T2: Punt return roll 3-6, ELECTRIC•.",
      "T2: FG roll 2-3, 11-53.",
      "T2: XP roll 5-5, 11-66.",
    ]);
    expect(draft.log.map((entry) => entry.franchiseId)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect(draft.log.every((entry) => entry.step === "special-teams")).toBe(true);
  });

  it("uses the 15-yard XP column for a 15-yard league", () => {
    const fifteen = openDraft([team(1)], dice([1, 1], [1, 1], [1, 1], [1, 1]));
    const two = openDraft([team(1)], dice([1, 1], [1, 1], [1, 1], [1, 1]));

    expect(rollSpecialTeams(fifteen, 15)[0].xpRange).toBe("11-56");
    expect(rollSpecialTeams(two, 2)[0].xpRange).toBe("11-63");
  });

  it("re-rolls the result most likely to improve and keeps a better one", () => {
    // No punt return quality improves on 11 of 36 rolls, no kickoff return
    // quality on 8, and the two kicks are already at their best.
    const draft = openDraft([team(1, 1)], dice([1, 1], [1, 1], [6, 6], [6, 6], [5, 6]));

    const [special] = rollSpecialTeams(draft, 2);

    expect(special).toEqual({
      kickReturn: null,
      puntReturn: "ELECTRIC",
      fgRange: "11-65",
      xpRange: "11-66",
    });
    expect(messages(draft)[4]).toBe(
      "T1: Spends 1 FP to re-roll Punt return (no quality). Roll 5-6, ELECTRIC: kept. " +
        "0 FP left.",
    );
    expect(draft.cards[0].points).toBe(0);
  });

  it("breaks a tie in favor of the earlier column", () => {
    // No kickoff return quality and an FG of 11-61 both improve on 8 of 36.
    const draft = openDraft([team(1, 1)], dice([1, 1], [6, 6], [3, 6], [6, 6], [6, 6]));

    const [special] = rollSpecialTeams(draft, 2);

    expect(special).toMatchObject({ kickReturn: "ELECTRIC", fgRange: "11-61" });
  });

  it("keeps the old result when the new roll is no better", () => {
    const draft = openDraft(
      [team(1, 2)],
      dice([6, 6], [6, 6], [2, 6], [6, 6], [1, 1], [2, 6]),
    );

    const [special] = rollSpecialTeams(draft, 2);

    expect(special.fgRange).toBe("11-55");
    expect(messages(draft).slice(4)).toEqual([
      "T1: Spends 1 FP to re-roll FG (11-55). Roll 1-1, 11-45: keeps 11-55. 1 FP left.",
      "T1: Spends 1 FP to re-roll FG (11-55). Roll 2-6, 11-55: keeps 11-55. 0 FP left.",
    ]);
  });

  it("moves on to the next weakest result as results improve", () => {
    // FG 11-45 improves on 35 of 36 rolls and goes first. Once it is 11-65
    // the XP of 11-56 (33 of 36) is the weakest.
    const draft = openDraft(
      [team(1, 2)],
      dice([6, 6], [6, 6], [1, 1], [1, 1], [6, 6], [5, 5]),
    );

    const [special] = rollSpecialTeams(draft, 15);

    expect(special).toMatchObject({ fgRange: "11-65", xpRange: "11-66" });
    expect(messages(draft).slice(4)).toEqual([
      "T1: Spends 1 FP to re-roll FG (11-45). Roll 6-6, 11-65: kept. 1 FP left.",
      "T1: Spends 1 FP to re-roll XP (11-56). Roll 5-5, 11-66: kept. 0 FP left.",
    ]);
  });

  it("stops when every result is at its best and loses the unused FP", () => {
    const draft = openDraft([team(1, 3)], dice([6, 6], [5, 6], [5, 5], [6, 6]));

    rollSpecialTeams(draft, 15);

    expect(messages(draft)[4]).toBe("T1: 3 FP unused and lost.");
    expect(messages(draft)).toHaveLength(5);
  });

  it("makes no re-roll and logs no loss for a team with no FP", () => {
    const draft = openDraft([team(1)], dice([1, 1], [1, 1], [1, 1], [1, 1]));

    rollSpecialTeams(draft, 2);

    expect(messages(draft)).toHaveLength(4);
  });
});
