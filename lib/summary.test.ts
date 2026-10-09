import { describe, expect, it } from "vitest";
import { resolveView, teamSummary } from "@/lib/summary";
import type { Team } from "@/lib/teams";

function team(overrides: Partial<Team> = {}): Team {
  return {
    id: 7,
    franchiseId: 7,
    divisionId: null,
    position: 0,
    city: "Buffalo",
    nickname: "Blizzard",
    headCoachName: "Sean Marsh",
    primaryColor: "#003594",
    secondaryColor: "#c8102e",
    offenseTag: "R+",
    ownershipStyle: "SAVVY",
    ownershipLoyalty: "LOYAL",
    frontOfficeGrade: "A",
    headCoachGrade: "B",
    offenseProfile: "PROLIFIC",
    offenseQualities: [
      { quality: "SOLID", strength: "FULL" },
      { quality: "RELIABLE", strength: "SEMI" },
    ],
    defenseProfile: "AVERAGE",
    defenseQualities: [{ quality: "ACTIVE", strength: "SEMI" }],
    kickReturn: null,
    puntReturn: "ELECTRIC_SEMI",
    fgRange: "11-56",
    xpRange: "11-63",
    ...overrides,
  };
}

describe("resolveView", () => {
  it.each([
    [undefined, "accepted", "summary"],
    [undefined, "draft", "detail"],
    ["summary", "draft", "summary"],
    ["detail", "accepted", "detail"],
    ["bogus", "accepted", "summary"],
    ["bogus", "draft", "detail"],
    ["", "accepted", "summary"],
    [["detail", "summary"], "accepted", "summary"],
    ["summary", "setup", "detail"],
    [undefined, "setup", "detail"],
  ] as const)("reads %j on a %s league as %s", (param, status, expected) => {
    expect(resolveView(param as string | string[] | undefined, status)).toBe(expected);
  });
});

describe("teamSummary", () => {
  it("collects everything about a fully drafted team", () => {
    const summary = teamSummary(team());
    expect(summary).toMatchObject({
      name: "Buffalo Blizzard",
      coach: "Sean Marsh",
      primaryColor: "#003594",
      secondaryColor: "#c8102e",
      offenseTag: "R+",
      ownership: "SAVVY, LOYAL",
      frontOfficeGrade: "A",
      headCoachGrade: "B",
      baseFranchisePoints: "3",
      kickReturn: "None",
      fgRange: "11-56",
      xpRange: "11-63",
    });
    expect(summary.puntReturn).not.toBe("None");
    expect(summary.offense?.[0]).toBe("PROLIFIC");
    expect(summary.offense).toHaveLength(3);
    // AVERAGE is no profile, so only the quality is listed.
    expect(summary.defense).toEqual(["ACTIVE•"]);
  });

  it("lists the profile first with the qualities, and None for an empty side", () => {
    const summary = teamSummary(
      team({ offenseProfile: "DULL_SEMI", defenseProfile: "AVERAGE", defenseQualities: [] }),
    );
    expect(summary.offense).toEqual(["DULL•", "SOLID", "RELIABLE•"]);
    expect(summary.defense).toEqual(["None"]);
  });

  it("reads None for a team with no ownership quality", () => {
    expect(teamSummary(team({ ownershipStyle: null, ownershipLoyalty: null })).ownership).toBe(
      "None",
    );
  });

  it("leaves undrafted parts null", () => {
    expect(
      teamSummary(
        team({
          offenseProfile: null,
          offenseQualities: null,
          defenseProfile: null,
          defenseQualities: null,
          kickReturn: null,
          puntReturn: null,
          fgRange: null,
          xpRange: null,
          frontOfficeGrade: null,
          headCoachGrade: null,
        }),
      ),
    ).toMatchObject({
      offense: null,
      defense: null,
      kickReturn: null,
      puntReturn: null,
      fgRange: null,
      baseFranchisePoints: null,
    });
  });
});
