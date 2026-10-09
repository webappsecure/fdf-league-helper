import { describe, expect, it } from "vitest";
import type { Rng } from "@/lib/dice";
import { TABLE_G_SEASON } from "@/lib/reference/annual-draft-tables";
import type { DefenseProfile } from "@/lib/reference/defense-tables";
import { qualityLabel, type OffenseProfile } from "@/lib/reference/offense-tables";
import { runAnnualDraft, type AnnualTeam } from "@/lib/rules/annual-draft";

// Just under 1: a shuffle keeps its order and a die shows 6.
const KEEP = 0.9999;

// Replays the given values, then keeps every later shuffle in order and shows
// 6-6 on every later roll.
function script(...values: number[]): Rng {
  let next = 0;
  return () => values[next++] ?? KEEP;
}

function roll(first: number, second: number): number[] {
  return [(first - 0.5) / 6, (second - 0.5) / 6];
}

function die(value: number): number {
  return (value - 0.5) / 6;
}

type Spec = { offense?: OffenseProfile; defense?: DefenseProfile; points?: number };

function teams(...specs: Spec[]): AnnualTeam[] {
  return specs.map((spec, index) => ({
    franchiseId: index + 1,
    teamName: `T${index + 1}`,
    headCoachGrade: "C",
    points: spec.points ?? 0,
    previousOffense: spec.offense ?? "AVERAGE",
    previousDefense: spec.defense ?? "AVERAGE",
  }));
}

function offense(result: ReturnType<typeof runAnnualDraft>, id: number): string {
  const team = result.results.find((entry) => entry.franchiseId === id)!;
  return `${team.offenseProfile}: ${team.offenseQualities.map(qualityLabel).join(", ")}`;
}

function messages(result: ReturnType<typeof runAnnualDraft>): string[] {
  return result.log.map((entry) => entry.message);
}

describe("Table J", () => {
  it("rolls in the column of the previous profile and sets the new profile", () => {
    const result = runAnnualDraft(teams({ offense: "AVERAGE" }), script(...roll(5, 5)));
    expect(offense(result, 1)).toBe("PROLIFIC_SEMI: DYNAMIC, SOLID•");
  });

  it("never pays when the result is not lower", () => {
    const result = runAnnualDraft(teams({ offense: "PROLIFIC", points: 3 }), script(...roll(3, 6)));
    expect(result.results[0].offenseProfile).toBe("PROLIFIC");
    expect(result.results[0].pointsLeft).toBe(3);
    expect(messages(result).some((line) => line.includes("spends"))).toBe(false);
  });

  it("pays 1 FP to roll again after a lower result and stops at the first that is not lower", () => {
    const result = runAnnualDraft(
      teams({ offense: "PROLIFIC", points: 3 }),
      script(...roll(1, 1), ...roll(3, 6)),
    );
    expect(result.results[0].offenseProfile).toBe("PROLIFIC");
    expect(result.results[0].pointsLeft).toBe(2);
    expect(messages(result).filter((line) => line.includes("spends 1 FP"))).toHaveLength(1);
  });

  it("stops when the FP run out and keeps the best of its rolls", () => {
    const result = runAnnualDraft(
      teams({ offense: "PROLIFIC", points: 2 }),
      script(...roll(1, 1), ...roll(1, 2), ...roll(1, 1)),
    );
    // DULL, then AVERAGE, then DULL again with no FP left.
    expect(result.results[0].offenseProfile).toBe("AVERAGE");
    expect(result.results[0].pointsLeft).toBe(0);
  });

  it("takes a lower result as is for a team with no FP", () => {
    const result = runAnnualDraft(teams({ offense: "PROLIFIC" }), script(...roll(1, 1)));
    expect(result.results[0].offenseProfile).toBe("DULL");
    expect(result.results[0].pointsLeft).toBe(0);
  });

  it("rolls Table G for a (*) result and saves the text", () => {
    const result = runAnnualDraft(teams({ offense: "PROLIFIC" }), script(...roll(6, 6), die(5)));
    expect(result.results[0].offenseProfile).toBe("PROLIFIC");
    expect(result.results[0].offenseSpecialResult).toBe(TABLE_G_SEASON.PROLIFIC_OFFENSE[4]);
    expect(result.results[0].defenseSpecialResult).toBeNull();
  });

  it("rolls the DULL OFFENSE column of Table G for a (**) result", () => {
    const result = runAnnualDraft(teams({ offense: "DULL" }), script(...roll(1, 3), die(2)));
    expect(result.results[0].offenseProfile).toBe("DULL");
    expect(result.results[0].offenseSpecialResult).toBe(TABLE_G_SEASON.DULL_OFFENSE[1]);
  });
});

describe("Table K", () => {
  it("gives a team that stays PROLIFIC the qualities of its row", () => {
    const result = runAnnualDraft(
      teams({ offense: "PROLIFIC" }),
      script(...roll(3, 6), ...roll(3, 5)),
    );
    expect(offense(result, 1)).toBe("PROLIFIC: DYNAMIC•, SOLID");
  });

  it("does not roll for average teams", () => {
    const result = runAnnualDraft(teams({}), script(...roll(1, 2)));
    expect(offense(result, 1)).toBe("AVERAGE: ");
    expect(messages(result).some((line) => line.includes("Table K"))).toBe(false);
  });

  it("gives a footnote's qualities to the next average team in the deck", () => {
    const result = runAnnualDraft(
      teams({ offense: "PROLIFIC" }, {}, {}),
      script(...roll(3, 6), ...roll(1, 2), ...roll(1, 2), KEEP, ...roll(1, 5)),
    );
    expect(offense(result, 1)).toBe("PROLIFIC: SOLID•");
    expect(offense(result, 2)).toBe("AVERAGE: DYNAMIC•");
    expect(offense(result, 3)).toBe("AVERAGE: ");
  });

  it("lets a team with enough FP pay 2 to avoid two negative qualities", () => {
    const result = runAnnualDraft(
      teams({ offense: "DULL" }, { points: 2 }, {}),
      script(...roll(1, 1), ...roll(1, 2), ...roll(1, 2), KEEP, ...roll(1, 1)),
    );
    expect(offense(result, 1)).toBe("DULL_SEMI: ");
    expect(offense(result, 2)).toBe("AVERAGE: ");
    expect(result.results[1].pointsLeft).toBe(0);
    expect(offense(result, 3)).toBe("AVERAGE: ERRATIC•, POROUS•");
    expect(messages(result).some((line) => line.includes("Spends 2 FP"))).toBe(true);
  });

  it("charges 1 FP to avoid a single negative quality", () => {
    // DULL 1-5 stays DULL• ... DULL• column 3-6 is DULL•, POROUS• footnote e.
    const result = runAnnualDraft(
      teams({ offense: "DULL_SEMI" }, { points: 1 }, {}),
      script(...roll(1, 1), ...roll(1, 2), ...roll(1, 2), KEEP, ...roll(3, 6)),
    );
    expect(result.results[1].pointsLeft).toBe(0);
    expect(offense(result, 3)).toBe("AVERAGE: ERRATIC•");
  });

  it("ends the step quietly when no team remains to draw", () => {
    const result = runAnnualDraft(teams({ offense: "DULL" }), script(...roll(1, 1), ...roll(1, 1)));
    expect(offense(result, 1)).toBe("DULL_SEMI: ");
    expect(messages(result).some((line) => line.includes("no teams remain"))).toBe(true);
  });
});

describe("step 8, defense", () => {
  it("rolls Table L from the previous defense and spends the FP step 7 left", () => {
    const result = runAnnualDraft(
      teams({ defense: "STAUNCH", points: 1 }),
      script(...roll(1, 2), ...roll(1, 1), ...roll(3, 6)),
    );
    expect(result.results[0].defenseProfile).toBe("STAUNCH");
    expect(result.results[0].pointsLeft).toBe(0);
    expect(result.log.filter((entry) => entry.step === "defense-profile").length).toBeGreaterThan(
      0,
    );
  });

  it("rolls the STAUNCH DEFENSE column of Table G for a (*) result", () => {
    const result = runAnnualDraft(
      teams({ defense: "STAUNCH" }),
      script(...roll(1, 2), ...roll(6, 6), die(1)),
    );
    expect(result.results[0].defenseSpecialResult).toBe(TABLE_G_SEASON.STAUNCH_DEFENSE[0]);
  });

  it("rolls the INEPT DEFENSE column of Table G for a (**) result", () => {
    const result = runAnnualDraft(
      teams({ defense: "INEPT" }),
      script(...roll(1, 2), ...roll(1, 3), die(6)),
    );
    expect(result.results[0].defenseProfile).toBe("INEPT");
    expect(result.results[0].defenseSpecialResult).toBe(TABLE_G_SEASON.INEPT_DEFENSE[5]);
  });

  it("makes a team with no previous profile average", () => {
    const result = runAnnualDraft(teams({}), script(...roll(1, 2), ...roll(1, 4)));
    expect(result.results[0].defenseProfile).toBe("AVERAGE");
  });

  it("gives defense qualities from Table M", () => {
    const result = runAnnualDraft(
      teams({ defense: "STAUNCH" }),
      script(...roll(1, 2), ...roll(3, 6), ...roll(1, 5)),
    );
    expect(result.results[0].defenseQualities.map(qualityLabel)).toEqual(["STIFF•"]);
  });
});

describe("the log", () => {
  it("names only steps 7 and 8", () => {
    const result = runAnnualDraft(teams({}, {}), script());
    expect(new Set(result.log.map((entry) => entry.step))).toEqual(
      new Set(["offense-profile", "defense-profile"]),
    );
  });
});
