import { describe, expect, it } from "vitest";
import {
  defaultXpKickDistance,
  validateLeagueSetup,
  type LeagueSetupInput,
} from "@/lib/league-setup";

function setup(overrides: Partial<LeagueSetupInput> = {}): LeagueSetupInput {
  return {
    name: "Continental League",
    seasonLabel: "Season 1",
    xpKickDistance: 2,
    teamCount: 8,
    structure: { kind: "none" },
    ...overrides,
  };
}

function errorFields(input: unknown): string[] {
  const result = validateLeagueSetup(input);
  return result.ok ? [] : result.errors.map((error) => error.field);
}

describe("defaultXpKickDistance", () => {
  it.each([
    ["2014", 2],
    ["2015", 15],
    ["2031", 15],
    [" 2016 ", 15],
    ["Season 1", 2],
    ["2016 Season", 2],
    ["", 2],
  ] as const)("label %j defaults to the %i-yard line", (label, expected) => {
    expect(defaultXpKickDistance(label)).toBe(expected);
  });
});

describe("validateLeagueSetup", () => {
  it("accepts a league with no structure and trims text", () => {
    const result = validateLeagueSetup(setup({ name: "  Continental League  " }));

    expect(result).toEqual({ ok: true, value: setup() });
  });

  it("accepts a league with divisions only", () => {
    const input = setup({
      teamCount: 12,
      structure: {
        kind: "divisions",
        divisions: [
          { name: "East", teamCount: 6 },
          { name: "West", teamCount: 6 },
        ],
      },
    });

    expect(validateLeagueSetup(input)).toEqual({ ok: true, value: input });
  });

  it("accepts a league with conferences and divisions", () => {
    const input = setup({
      teamCount: 16,
      structure: {
        kind: "conferences",
        conferences: [
          {
            name: "American",
            divisions: [
              { name: "East", teamCount: 4 },
              { name: "West", teamCount: 4 },
            ],
          },
          {
            name: "National",
            divisions: [
              { name: "East", teamCount: 4 },
              { name: "West", teamCount: 4 },
            ],
          },
        ],
      },
    });

    expect(validateLeagueSetup(input)).toEqual({ ok: true, value: input });
  });

  it.each([
    [7, false],
    [8, true],
    [56, true],
    [57, false],
    [8.5, false],
  ])("team count %d valid: %s", (teamCount, valid) => {
    expect(validateLeagueSetup(setup({ teamCount })).ok).toBe(valid);
  });

  it("requires a name and season label", () => {
    expect(errorFields(setup({ name: "   ", seasonLabel: "" }))).toEqual([
      "name",
      "seasonLabel",
    ]);
  });

  it("rejects names that are too long", () => {
    const fields = errorFields(
      setup({
        name: "x".repeat(101),
        seasonLabel: "x".repeat(31),
        structure: {
          kind: "divisions",
          divisions: [{ name: "x".repeat(51), teamCount: 8 }],
        },
      }),
    );

    expect(fields).toEqual(["name", "seasonLabel", "divisions.0.name"]);
  });

  it("rejects an unknown XP kick distance", () => {
    expect(errorFields({ ...setup(), xpKickDistance: 10 })).toEqual(["xpKickDistance"]);
  });

  it("rejects division counts that do not add up to the team count", () => {
    const result = validateLeagueSetup(
      setup({
        teamCount: 12,
        structure: {
          kind: "divisions",
          divisions: [
            { name: "East", teamCount: 6 },
            { name: "West", teamCount: 5 },
          ],
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: "structure",
          message: "Division teams add up to 11, but the league has 12 teams.",
        },
      ],
    });
  });

  it("rejects a conference with no divisions", () => {
    const fields = errorFields(
      setup({
        structure: {
          kind: "conferences",
          conferences: [
            { name: "American", divisions: [{ name: "East", teamCount: 8 }] },
            { name: "National", divisions: [] },
          ],
        },
      }),
    );

    expect(fields).toEqual(["conferences.1.divisions"]);
  });

  it("rejects a division with zero teams without also reporting the sum", () => {
    const fields = errorFields(
      setup({
        structure: {
          kind: "divisions",
          divisions: [
            { name: "East", teamCount: 8 },
            { name: "West", teamCount: 0 },
          ],
        },
      }),
    );

    expect(fields).toEqual(["divisions.1.teamCount"]);
  });

  it("rejects an empty structure and a missing structure kind", () => {
    expect(errorFields(setup({ structure: { kind: "divisions", divisions: [] } }))).toEqual([
      "structure",
    ]);
    expect(errorFields({ ...setup(), structure: undefined })).toEqual(["structure"]);
  });

  it("reports every problem for input that is not an object", () => {
    expect(errorFields(null)).toEqual([
      "name",
      "seasonLabel",
      "xpKickDistance",
      "teamCount",
      "structure",
    ]);
  });
});
