import { describe, expect, it } from "vitest";
import type { Rng } from "@/lib/dice";
import {
  generateIdentities,
  isRerollField,
  pickCity,
  rerollField,
  rollCoachName,
  rollColors,
  rollNickname,
  validateTeamField,
  type Identity,
} from "@/lib/identity";
import { CITIES } from "@/lib/reference/cities";
import { PALETTE } from "@/lib/reference/palette";

// Replays the given values in order, then repeats them.
function scripted(values: number[]): Rng {
  let next = 0;
  return () => values[next++ % values.length];
}

// A small deterministic generator, so the 56-team tests cover varied rolls.
function seeded(seed: number): Rng {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// The value that makes Math.floor(rng() * total) land on the given roll.
function landingOn(roll: number, total: number): number {
  return (roll + 0.5) / total;
}

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    city: "Chicago",
    nickname: "Aces",
    headCoachName: "Adam Adams",
    primaryColor: "#000000",
    secondaryColor: "#ffffff",
    ...overrides,
  };
}

describe("pickCity", () => {
  it.each([
    [0, "New York"],
    [41, "New York"],
    [42, "Los Angeles"],
    [60, "Los Angeles"],
    [61, "Chicago"],
    [346, "Toledo"],
    [347, "Winston-Salem"],
  ])("roll %i of 348 picks %s", (roll, expected) => {
    expect(pickCity([], scripted([landingOn(roll, 348)]))).toBe(expected);
  });

  it("removes taken cities and their weight from the pick", () => {
    // Without New York the list is 306 wide and starts at Los Angeles.
    const taken = ["new york "];

    expect(pickCity(taken, scripted([landingOn(0, 306)]))).toBe("Los Angeles");
    expect(pickCity(taken, scripted([landingOn(305, 306)]))).toBe("Winston-Salem");
  });

  it("still returns a city when every city is taken", () => {
    const everyCity = CITIES.map((city) => city.name);

    expect(pickCity(everyCity, scripted([0]))).toBe("New York");
  });
});

describe("rollNickname", () => {
  it("picks the table, then rolls d100 on it", () => {
    expect(rollNickname([], scripted([0, 0, 0.1]))).toBe("49ers");
    expect(rollNickname([], scripted([0.5, 0, 0]))).toBe("Yellow Jackets");
    expect(rollNickname([], scripted([0.9, 0, 0.2]))).toBe("Banana Slugs");
  });

  it("rolls again when another team holds the nickname", () => {
    const rng = scripted([0, 0, 0.1, 0.5, 0, 0.1]);

    expect(rollNickname(["49ERS"], rng)).toBe("Aces");
  });

  it("gives up after its attempt limit instead of looping forever", () => {
    expect(rollNickname(["49ers"], scripted([0, 0, 0.1]))).toBe("49ers");
  });
});

describe("rollCoachName", () => {
  it("joins a first name roll and a last name roll", () => {
    expect(rollCoachName([], scripted([0, 0.1, 0, 0]))).toBe("Adam Young");
  });

  it("rolls both names again when the full name is held", () => {
    const rng = scripted([0, 0.1, 0, 0.1, 0, 0.2, 0, 0.2]);

    expect(rollCoachName(["Adam Adams"], rng)).toBe("Al Allen");
  });
});

describe("rollColors", () => {
  it("never pairs a color with itself", () => {
    const top = landingOn(PALETTE.length - 1, PALETTE.length);

    expect(rollColors([], scripted([0, 0]))).toEqual({
      primaryColor: PALETTE[0].hex,
      secondaryColor: PALETTE[1].hex,
    });
    expect(rollColors([], scripted([top, landingOn(16, 17)]))).toEqual({
      primaryColor: PALETTE[17].hex,
      secondaryColor: PALETTE[16].hex,
    });
  });

  it("rolls again when another team holds the same ordered pair", () => {
    const held = { primaryColor: PALETTE[0].hex, secondaryColor: PALETTE[1].hex };
    const rng = scripted([0, 0, landingOn(1, 18), 0]);

    expect(rollColors([held], rng)).toEqual({
      primaryColor: PALETTE[1].hex,
      secondaryColor: PALETTE[0].hex,
    });
  });
});

describe("generateIdentities", () => {
  it.each([1, 2, 3, 4, 5])("repeats nothing across 56 teams (seed %i)", (seed) => {
    const identities = generateIdentities(56, seeded(seed));
    const distinct = (values: string[]) => new Set(values).size;

    expect(identities).toHaveLength(56);
    expect(distinct(identities.map((team) => team.city))).toBe(56);
    expect(distinct(identities.map((team) => team.nickname))).toBe(56);
    expect(distinct(identities.map((team) => team.headCoachName))).toBe(56);
    expect(
      distinct(identities.map((team) => `${team.primaryColor}/${team.secondaryColor}`)),
    ).toBe(56);
    expect(identities.filter((team) => team.primaryColor === team.secondaryColor)).toEqual([]);
  });

  it("only uses cities from the list and colors from the palette", () => {
    const cities = new Set(CITIES.map((city) => city.name));
    const colors = new Set(PALETTE.map((color) => color.hex));

    for (const team of generateIdentities(56, seeded(9))) {
      expect(cities.has(team.city), team.city).toBe(true);
      expect(colors.has(team.primaryColor) && colors.has(team.secondaryColor)).toBe(true);
    }
  });
});

describe("rerollField", () => {
  it("never returns the current city or one another team holds", () => {
    const current = identity({ city: "New York" });
    const others = [identity({ city: "Los Angeles" })];

    // Roll 0 would be New York, then Los Angeles; both are excluded.
    expect(rerollField("city", current, others, scripted([0]))).toEqual({ city: "Chicago" });
  });

  it("never returns the current nickname or one another team holds", () => {
    const current = identity({ nickname: "49ers" });
    const others = [identity({ nickname: "Aces" })];
    const rng = scripted([0, 0, 0.1, 0.5, 0, 0.1, 0.9, 0, 0.1]);

    expect(rerollField("nickname", current, others, rng)).toEqual({ nickname: "Academics" });
  });

  it("never returns the current coach name", () => {
    const current = identity({ headCoachName: "Adam Adams" });
    const rng = scripted([0, 0.1, 0, 0.1, 0, 0.2, 0, 0.2]);

    expect(rerollField("headCoachName", current, [], rng)).toEqual({
      headCoachName: "Al Allen",
    });
  });

  it("replaces both colors and never returns the current pair", () => {
    const current = identity({ primaryColor: PALETTE[0].hex, secondaryColor: PALETTE[1].hex });
    const rng = scripted([0, 0, landingOn(2, 18), 0]);

    expect(rerollField("colors", current, [], rng)).toEqual({
      primaryColor: PALETTE[2].hex,
      secondaryColor: PALETTE[0].hex,
    });
  });
});

describe("isRerollField", () => {
  it("accepts the four re-roll fields only", () => {
    expect(["city", "nickname", "headCoachName", "colors"].every(isRerollField)).toBe(true);
    expect([isRerollField("primaryColor"), isRerollField(undefined)]).toEqual([false, false]);
  });
});

describe("validateTeamField", () => {
  it("trims accepted text", () => {
    expect(validateTeamField("city", "  Green Bay  ")).toEqual({
      ok: true,
      field: "city",
      value: "Green Bay",
    });
  });

  it.each([
    ["city", "Enter a city."],
    ["nickname", "Enter a nickname."],
    ["headCoachName", "Enter a head coach name."],
  ])("requires %s", (field, error) => {
    expect(validateTeamField(field, "   ")).toEqual({ ok: false, error });
    expect(validateTeamField(field, undefined)).toEqual({ ok: false, error });
  });

  it("limits text to 50 characters", () => {
    expect(validateTeamField("nickname", "x".repeat(50)).ok).toBe(true);
    expect(validateTeamField("nickname", "x".repeat(51))).toEqual({
      ok: false,
      error: "Keep this to 50 characters or fewer.",
    });
  });

  it("accepts a six-digit hex color and stores it lowercase", () => {
    expect(validateTeamField("primaryColor", "#FFB612")).toEqual({
      ok: true,
      field: "primaryColor",
      value: "#ffb612",
    });
  });

  it.each(["", "red", "#fff", "#12345g", "#1234567"])("rejects the color %j", (value) => {
    expect(validateTeamField("secondaryColor", value)).toEqual({
      ok: false,
      error: "Choose a color.",
    });
  });

  it.each(["R", "R+", "P", "P+"])("accepts the offense tag %s", (tag) => {
    expect(validateTeamField("offenseTag", tag)).toEqual({
      ok: true,
      field: "offenseTag",
      value: tag,
    });
  });

  it("trims an offense tag", () => {
    expect(validateTeamField("offenseTag", "  P+ ")).toEqual({
      ok: true,
      field: "offenseTag",
      value: "P+",
    });
  });

  it.each(["", "   "])("treats %j as no offense tag", (value) => {
    expect(validateTeamField("offenseTag", value)).toEqual({
      ok: true,
      field: "offenseTag",
      value: null,
    });
  });

  it.each(["r", "X", "R++", "[R]", "PROLIFIC", undefined, null, 7])(
    "rejects the offense tag %j",
    (value) => {
      expect(validateTeamField("offenseTag", value)).toEqual({
        ok: false,
        error: "Choose an offense tag.",
      });
    },
  );

  it("rejects an unknown field", () => {
    expect(validateTeamField("colors", "#000000")).toEqual({
      ok: false,
      error: "That team could not be found.",
    });
  });
});
