import { describe, expect, it } from "vitest";
import type { Rng } from "@/lib/dice";
import { TABLE_U } from "@/lib/reference/events-table";
import {
  applyEvent,
  moveGrade,
  runEvents,
  runSaleOrMove,
  setFullQuality,
  shiftQuality,
  stepRange,
  type EventTeam,
} from "@/lib/rules/camp-events";

// A random source that makes the dice show the given faces in order.
function dice(...faces: number[]): Rng {
  let next = 0;
  return () => {
    if (next >= faces.length) throw new Error("rolled more dice than the script holds");
    return (faces[next++] - 0.5) / 6;
  };
}

function team(overrides: Partial<EventTeam> = {}): EventTeam {
  return {
    franchiseId: 1,
    teamName: "T1",
    frontOfficeGrade: "C",
    headCoachGrade: "C",
    hotSeat: false,
    ownershipStyle: null,
    ownershipLoyalty: null,
    offenseProfile: "AVERAGE",
    defenseProfile: "AVERAGE",
    offenseQualities: [],
    defenseQualities: [],
    special: {
      kickReturn: null,
      puntReturn: null,
      fgRange: "11-53",
      xpRange: "11-63",
    },
    pendingMove: false,
    ...overrides,
  };
}

// `never` lets one helper build offense and defense qualities alike.
const semi = (quality: string) => ({
  quality: quality as never,
  strength: "SEMI" as const,
});
const full = (quality: string) => ({
  quality: quality as never,
  strength: "FULL" as const,
});

describe("helpers", () => {
  it("shifts a pair toward one side and stops at full strength", () => {
    const pair = ["PUNISHING", "MILD"] as const;
    expect(shiftQuality([full("PUNISHING")], ...pair, "negative")).toEqual({
      qualities: [semi("MILD")],
      note: "Loses PUNISHING and gains MILD•.",
    });
    expect(shiftQuality([semi("MILD")], ...pair, "negative").qualities).toEqual([full("MILD")]);
    expect(shiftQuality([full("MILD")], ...pair, "negative")).toEqual({
      qualities: [full("MILD")],
      note: null,
    });
    expect(shiftQuality([], ...pair, "positive").qualities).toEqual([semi("PUNISHING")]);
  });

  it("sets a quality at full strength in place of its opposite", () => {
    expect(setFullQuality([semi("SHAKY"), full("SOLID")], "RELIABLE", "SHAKY", "negative")).toEqual(
      {
        qualities: [full("SOLID"), full("SHAKY")],
        note: "Gains SHAKY.",
      },
    );
    expect(setFullQuality([full("SHAKY")], "RELIABLE", "SHAKY", "negative").note).toBeNull();
  });

  it("moves grades and ranges, stopping at the ends", () => {
    expect(moveGrade("A", 1)).toBe("A");
    expect(moveGrade("F", -1)).toBe("F");
    expect(moveGrade("C", 2)).toBe("A");
    expect(stepRange("11-56", 2)).toBe("11-62");
    expect(stepRange("11-65", 2)).toBe("11-66");
    expect(stepRange("11-66", 2)).toBe("11-66");
  });
});

describe("Table U", () => {
  it("has a result for every roll", () => {
    expect(Object.keys(TABLE_U)).toHaveLength(36);
  });

  // Each row: roll, the team before, and what changed.
  const rows: [string, Partial<EventTeam>, Partial<EventTeam> | null][] = [
    ["11", { defenseQualities: [full("PUNISHING")] }, { defenseQualities: [semi("MILD")] }],
    ["11", { defenseQualities: [full("MILD")] }, null],
    ["12", { offenseProfile: "DULL_SEMI" }, { offenseProfile: "AVERAGE" }],
    ["12", { offenseProfile: "PROLIFIC" }, null],
    ["13", { offenseProfile: "PROLIFIC" }, { offenseProfile: "DULL_SEMI" }],
    ["13", { offenseProfile: "DULL_SEMI" }, { offenseProfile: "DULL" }],
    ["13", { offenseProfile: "DULL" }, null],
    ["14", { defenseQualities: [semi("PUNISHING")] }, { defenseQualities: [full("PUNISHING")] }],
    ["15", { offenseQualities: [full("POROUS")] }, { offenseQualities: [semi("SOLID")] }],
    [
      "16",
      { headCoachGrade: "B", offenseQualities: [full("UNDISCIPLINED")] },
      {
        offenseQualities: [full("DISCIPLINED")],
        defenseQualities: [full("DISCIPLINED")],
      },
    ],
    [
      "16",
      { headCoachGrade: "C", defenseQualities: [full("DISCIPLINED")] },
      {
        offenseQualities: [full("UNDISCIPLINED")],
        defenseQualities: [full("UNDISCIPLINED")],
      },
    ],
    [
      "21",
      {},
      {
        special: {
          kickReturn: null,
          puntReturn: null,
          fgRange: "11-55",
          xpRange: "11-65",
        },
      },
    ],
    ["22", { defenseQualities: [full("MEEK")] }, { defenseQualities: [semi("AGGRESSIVE")] }],
    ["23", { defenseQualities: [full("STIFF")] }, { defenseQualities: [semi("SOFT")] }],
    [
      "24",
      {},
      {
        special: {
          kickReturn: null,
          puntReturn: "ELECTRIC",
          fgRange: "11-53",
          xpRange: "11-63",
        },
      },
    ],
    [
      "24",
      {
        special: {
          kickReturn: null,
          puntReturn: "ELECTRIC",
          fgRange: "11-53",
          xpRange: "11-63",
        },
      },
      null,
    ],
    ["25", { frontOfficeGrade: "B" }, { headCoachGrade: "B" }],
    ["25", { frontOfficeGrade: "C" }, null],
    ["26", { defenseQualities: [full("ACTIVE")] }, { defenseQualities: [semi("PASSIVE")] }],
    [
      "31",
      { offenseProfile: "PROLIFIC", offenseQualities: [full("DYNAMIC")] },
      {
        offenseProfile: "AVERAGE",
        offenseQualities: [semi("ERRATIC")],
      },
    ],
    ["31", { offenseProfile: "DULL" }, { offenseQualities: [semi("ERRATIC")] }],
    ["32", { defenseProfile: "INEPT_SEMI" }, { defenseProfile: "AVERAGE" }],
    ["32", { defenseProfile: "STAUNCH" }, null],
    [
      "33",
      { offenseProfile: "DULL" },
      {
        offenseProfile: "PROLIFIC_SEMI",
        offenseQualities: [full("SHAKY")],
      },
    ],
    ["33", { offenseProfile: "PROLIFIC", offenseQualities: [full("SHAKY")] }, null],
    ["34", { ownershipLoyalty: "SELFISH" }, { frontOfficeGrade: "D" }],
    ["34", { ownershipStyle: "MEDDLING", frontOfficeGrade: "F" }, null],
    ["34", { ownershipStyle: "SAVVY" }, null],
    ["35", { offenseQualities: [full("CLUMSY")] }, { offenseQualities: [semi("SECURE")] }],
    ["36", { frontOfficeGrade: "C", headCoachGrade: "A" }, { headCoachGrade: "C" }],
    ["36", { frontOfficeGrade: "C", headCoachGrade: "C" }, { headCoachGrade: "D" }],
    ["36", { frontOfficeGrade: "C", headCoachGrade: "F" }, null],
    ["36", { frontOfficeGrade: "B", headCoachGrade: "A" }, null],
    ["41", { offenseQualities: [full("SECURE")] }, { offenseQualities: [semi("CLUMSY")] }],
    ["42", { frontOfficeGrade: "C" }, { frontOfficeGrade: "B" }],
    ["42", { frontOfficeGrade: "A" }, null],
    ["43", { defenseQualities: [full("AGGRESSIVE")] }, { defenseQualities: [semi("MEEK")] }],
    ["44", { defenseQualities: [full("PASSIVE")] }, { defenseQualities: [semi("ACTIVE")] }],
    ["45", { headCoachGrade: "D" }, { headCoachGrade: "C" }],
    ["45", { headCoachGrade: "B" }, null],
    ["45", { headCoachGrade: "A" }, null],
    ["46", { ownershipLoyalty: "LOYAL" }, { ownershipLoyalty: "SELFISH" }],
    ["46", { ownershipLoyalty: "SELFISH" }, null],
    ["51", {}, { hotSeat: true }],
    ["51", { hotSeat: true }, null],
    ["52", { offenseQualities: [full("SHAKY")] }, { offenseQualities: [semi("RELIABLE")] }],
    [
      "53",
      { offenseProfile: "PROLIFIC_SEMI" },
      {
        offenseProfile: "AVERAGE",
        offenseQualities: [semi("ERRATIC")],
      },
    ],
    ["54", { ownershipStyle: "SAVVY" }, { frontOfficeGrade: "B" }],
    ["54", { ownershipLoyalty: "LOYAL" }, { frontOfficeGrade: "B" }],
    ["54", {}, null],
    ["55", { offenseProfile: "DULL" }, { offenseProfile: "AVERAGE" }],
    ["55", { offenseProfile: "AVERAGE" }, { offenseProfile: "PROLIFIC" }],
    ["55", { offenseProfile: "PROLIFIC" }, null],
    ["56", { offenseQualities: [semi("EFFICIENT")] }, { offenseQualities: [] }],
    ["56", {}, null],
    [
      "61",
      {},
      {
        special: {
          kickReturn: null,
          puntReturn: null,
          fgRange: "11-44",
          xpRange: "11-55",
        },
      },
    ],
    ["62", { offenseQualities: [semi("RELIABLE")] }, { offenseQualities: [full("RELIABLE")] }],
    ["63", { defenseQualities: [full("SOFT")] }, { defenseQualities: [semi("STIFF")] }],
    [
      "64",
      {},
      {
        special: {
          kickReturn: "ELECTRIC",
          puntReturn: "ELECTRIC",
          fgRange: "11-53",
          xpRange: "11-63",
        },
      },
    ],
    ["65", { offenseQualities: [full("SOLID")] }, { offenseQualities: [semi("POROUS")] }],
    ["66", { offenseQualities: [full("INEFFICIENT")] }, { offenseQualities: [semi("EFFICIENT")] }],
  ];

  it.each(rows)("roll %s on %j", (key, before, after) => {
    const subject = team(before);
    const note = applyEvent(subject, key);
    if (after === null) {
      expect(note).toBeNull();
      expect(subject).toEqual(team(before));
    } else {
      expect(note).not.toBeNull();
      expect(subject).toEqual(team({ ...before, ...after }));
    }
  });

  it("covers every roll at least once", () => {
    expect(new Set(rows.map(([key]) => key))).toEqual(new Set(Object.keys(TABLE_U)));
  });
});

describe("step 8", () => {
  const teams = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      team({ franchiseId: index + 1, teamName: `T${index + 1}` }),
    );

  it("rolls for one third of the teams, rounded up, in draft order", () => {
    // Shuffling 4 teams takes 3 picks; a die face of 6 (just under 1) keeps order.
    const rng: Rng = (() => {
      const script = [0.999, 0.999, 0.999, 0.5, 0.5, 0.5, 0.5];
      let next = 0;
      return () => script[next++];
    })();
    const { teams: after, log } = runEvents(teams(4), rng);

    expect(log[0].message).toBe("2 of 4 teams roll on Table U.");
    expect(log).toHaveLength(3);
    expect(log[1].franchiseId).toBe(1);
    expect(log[2].franchiseId).toBe(2);
    expect(after).toHaveLength(4);
  });

  it("does not change the teams it is given", () => {
    const input = teams(3);
    const rng: Rng = (() => {
      const script = [0.999, 0.999, 0.999, 0.9, 0.9, 0.9];
      let next = 0;
      return () => script[next++];
    })();
    runEvents(input, rng);
    expect(input).toEqual(teams(3));
  });
});

describe("step 9", () => {
  it("skips teams that are not SELFISH", () => {
    const { log } = runSaleOrMove([team({ ownershipLoyalty: "LOYAL" }), team()], dice());
    expect(log.map((entry) => entry.message)).toEqual(["No team has SELFISH ownership."]);
  });

  it("sells on 1-1 and rolls the new ownership", () => {
    const { teams, log } = runSaleOrMove([team({ ownershipLoyalty: "SELFISH" })], dice(1, 1, 6, 6));
    expect(teams[0].ownershipStyle).toBe("SAVVY");
    expect(teams[0].ownershipLoyalty).toBe("LOYAL");
    expect(log[0].message).toContain("selling");
  });

  it("can sell to another SELFISH owner", () => {
    const { teams } = runSaleOrMove([team({ ownershipLoyalty: "SELFISH" })], dice(1, 1, 3, 1));
    expect(teams[0].ownershipLoyalty).toBe("SELFISH");
  });

  it("announces a move on 6-6 and does nothing on other rolls", () => {
    const { teams, log } = runSaleOrMove(
      [
        team({ franchiseId: 1, ownershipLoyalty: "SELFISH" }),
        team({ franchiseId: 2, ownershipLoyalty: "SELFISH" }),
      ],
      dice(6, 6, 1, 6),
    );
    expect(teams.map((each) => each.pendingMove)).toEqual([true, false]);
    expect(log[1].message).toBe("T1: roll 1-6. No event.");
  });
});
