import { describe, expect, it } from "vitest";
import type { Rng } from "@/lib/dice";
import { runCampSpecialTeams, type CampSpecialInput } from "@/lib/rules/camp-special-teams";

// A random source that plays back the given values and throws when they run
// out. A shuffle takes one value per swap; KEEP_ORDER leaves the order alone.
const KEEP_ORDER = 0.999;
function mixed(...values: number[]): Rng {
  let next = 0;
  return () => {
    if (next >= values.length) throw new Error("random source ran out");
    return values[next++];
  };
}
// A face (1-6) as the random value the dice read it from.
const face = (n: number) => (n - 0.5) / 6;

function team(id: number, previous: CampSpecialInput["previous"], points = 0): CampSpecialInput {
  return { franchiseId: id, teamName: `T${id}`, points, previous };
}

const none = {
  kickReturn: null,
  puntReturn: null,
  fgRange: "11-53",
  xpRange: "11-63",
} as const;

describe("training camp step 7", () => {
  it("keeps an ELECTRIC team by the draw and rolls the others", () => {
    // Two teams: cdv is 1. Shuffle of 2 holders takes one value (keeps order).
    // KR: T1 (ELECTRIC) is drawn first and kept, T2 rolls 1-1 (none).
    // PR: nobody holds ELECTRIC; shuffle, then T1 rolls 1-1, T2 rolls 1-1.
    // FG: shuffle, T1 kept (half of 2), T2 improves: rolls 6-6 (11-65, better).
    // XP: shuffle, T1 kept, T2 rolls 1-1 (11-63, not better than 11-63: kept).
    const rng = mixed(
      KEEP_ORDER,
      face(1),
      face(1),
      KEEP_ORDER,
      face(1),
      face(1),
      face(1),
      face(1),
      KEEP_ORDER,
      face(6),
      face(6),
      KEEP_ORDER,
      face(1),
      face(1),
    );
    const { results, log } = runCampSpecialTeams(
      [team(1, { ...none, kickReturn: "ELECTRIC" }), team(2, none)],
      15,
      rng,
    );

    expect(results[0]).toEqual({ ...none, kickReturn: "ELECTRIC" });
    expect(results[1]).toEqual({ ...none, fgRange: "11-65" });
    expect(log.map((entry) => entry.message)).toContain("T1: Kickoff return stays ELECTRIC.");
  });

  it("makes every team roll when nobody holds the quality", () => {
    const rng = mixed(
      KEEP_ORDER,
      face(1),
      face(1),
      face(1),
      face(1),
      KEEP_ORDER,
      face(1),
      face(1),
      face(1),
      face(1),
      KEEP_ORDER,
      face(1),
      face(1),
      KEEP_ORDER,
      face(1),
      face(1),
    );
    const { results } = runCampSpecialTeams([team(1, none), team(2, none)], 2, rng);
    expect(results).toHaveLength(2);
  });

  it("rolls every column for an expansion team and keeps it out of the draws", () => {
    // One holder: its shuffle takes no value. KR, PR, FG, XP for the expansion
    // team each roll 1-1; the existing team keeps FG and XP (half of 1, rounded up).
    const rng = mixed(
      face(1),
      face(1),
      face(1),
      face(1), // KR for T1 (not electric) and T2
      face(1),
      face(1),
      face(1),
      face(1), // PR
      face(2),
      face(2), // FG for T2
      face(2),
      face(2), // XP for T2
    );
    const { results } = runCampSpecialTeams([team(1, none), team(2, null)], 15, rng);

    expect(results[0]).toEqual(none);
    expect(results[1]).toEqual({
      kickReturn: null,
      puntReturn: null,
      fgRange: "11-54",
      xpRange: "11-63",
    });
  });

  it("does not let a team spend FP on a quality it kept", () => {
    // T1 keeps ELECTRIC KR (cdv 1) and PR; FG and XP are kept (half of one team).
    // Nothing is rolled, so its 3 FP cannot be spent.
    const held = {
      kickReturn: "ELECTRIC",
      puntReturn: "ELECTRIC",
      fgRange: "11-45",
      xpRange: "11-56",
    } as const;
    const rng = mixed();
    const { results, log } = runCampSpecialTeams([team(1, held, 3)], 15, rng);

    expect(results[0]).toEqual(held);
    expect(log.at(-1)?.message).toBe("T1: 3 FP unused and lost.");
  });

  it("spends FP on a slot that was rolled", () => {
    const held = {
      kickReturn: "ELECTRIC",
      puntReturn: null,
      fgRange: "11-45",
      xpRange: "11-56",
    } as const;
    // PR rolled 1-1 (none). FP: 1 re-roll of PR (best chance), rolling 6-6 (ELECTRIC),
    // then nothing can improve.
    const rng = mixed(face(1), face(1), face(6), face(6));
    const { results, log } = runCampSpecialTeams([team(1, held, 5)], 15, rng);

    expect(results[0].puntReturn).toBe("ELECTRIC");
    expect(log.some((entry) => entry.message.includes("Spends 1 FP to re-roll Punt return"))).toBe(
      true,
    );
  });

  it("rounds the draws up for an odd number of teams", () => {
    // Three holders. FG: keep 2, the remaining 1 improves, none roll fresh.
    const rng = mixed(
      KEEP_ORDER,
      KEEP_ORDER, // KR draw
      face(1),
      face(1),
      face(1),
      face(1),
      face(1),
      face(1), // KR rolls (cdv for 3 teams)
      KEEP_ORDER,
      KEEP_ORDER, // PR draw
      face(1),
      face(1),
      face(1),
      face(1),
      face(1),
      face(1),
      KEEP_ORDER,
      KEEP_ORDER,
      face(1),
      face(1), // FG: one improver
      KEEP_ORDER,
      KEEP_ORDER,
      face(1),
      face(1), // XP
    );
    const { log } = runCampSpecialTeams([team(1, none), team(2, none), team(3, none)], 15, rng);
    const fgStays = log.filter((entry) => entry.message.includes("FG stays"));
    expect(fgStays).toHaveLength(2);
  });
});
