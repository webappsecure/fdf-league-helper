import { describe, expect, it } from "vitest";
import {
  CARD_INK,
  CARD_PAPER,
  CITY_STEPS,
  TEAM_NAME_STEPS,
  cardColors,
  cardSheets,
  cardText,
  contrast,
  isCardTeam,
  textStep,
  type CardTeam,
} from "@/lib/cards";
import { PALETTE } from "@/lib/reference/palette";
import type { Team } from "@/lib/teams";

function team(overrides: Partial<CardTeam> = {}): CardTeam {
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
    offenseTag: null,
    ownershipStyle: "SAVVY",
    ownershipLoyalty: "LOYAL",
    frontOfficeGrade: "A",
    headCoachGrade: "B",
    offenseProfile: "PROLIFIC",
    offenseQualities: [
      { quality: "SOLID", strength: "FULL" },
      { quality: "RELIABLE", strength: "SEMI" },
      { quality: "EFFICIENT", strength: "SEMI" },
    ],
    defenseProfile: "AVERAGE",
    defenseQualities: [
      { quality: "ACTIVE", strength: "SEMI" },
      { quality: "UNDISCIPLINED", strength: "SEMI" },
    ],
    offenseSpecialResult: null,
    defenseSpecialResult: null,
    kickReturn: null,
    puntReturn: "ELECTRIC_SEMI",
    fgRange: "11-56",
    xpRange: "11-63",
    ...overrides,
  };
}

describe("isCardTeam", () => {
  it("accepts a team with its whole draft", () => {
    expect(isCardTeam(team())).toBe(true);
  });

  it.each(["offenseProfile", "defenseProfile", "fgRange", "xpRange"] as const)(
    "rejects a team with no %s",
    (field) => {
      expect(isCardTeam({ ...team(), [field]: null } as Team)).toBe(false);
    },
  );
});

describe("cardText", () => {
  it("prints the city, coach, team name and season label", () => {
    expect(cardText(team(), "2016")).toMatchObject({
      city: "Buffalo",
      coachLine: "Head Coach: Sean Marsh",
      teamName: "Blizzard",
      seasonLabel: "2016",
    });
  });

  it("leads a list with its profile and marks semi qualities", () => {
    expect(cardText(team(), "2016").offense).toEqual([
      "PROLIFIC",
      "SOLID",
      "RELIABLE•",
      "EFFICIENT•",
    ]);
    expect(cardText(team({ offenseProfile: "DULL_SEMI" }), "2016").offense[0]).toBe("DULL•");
    expect(
      cardText(team({ defenseProfile: "STAUNCH_SEMI", defenseQualities: [] }), "2016").defense,
    ).toEqual(["STAUNCH•"]);
    expect(cardText(team({ defenseProfile: "INEPT" }), "2016").defense[0]).toBe("INEPT");
  });

  it("leaves an AVERAGE profile out and keeps the qualities in card order", () => {
    expect(cardText(team(), "2016").defense).toEqual(["ACTIVE•", "UNDISCIPLINED•"]);
    expect(
      cardText(team({ offenseProfile: "AVERAGE", offenseQualities: [] }), "2016").offense,
    ).toEqual([]);
  });

  it("prints return qualities, or nothing, and the stored ranges", () => {
    expect(cardText(team(), "2016")).toMatchObject({
      kickReturn: "",
      puntReturn: "ELECTRIC•",
      fgRange: "11-56",
      xpRange: "11-63",
    });
    expect(cardText(team({ kickReturn: "ELECTRIC" }), "2016").kickReturn).toBe("ELECTRIC");
  });

  it("prints the stored special results, or none", () => {
    expect(cardText(team(), "2016")).toMatchObject({
      offenseSpecialResult: null,
      defenseSpecialResult: null,
    });
    expect(
      cardText(
        team({ offenseSpecialResult: "Offense result", defenseSpecialResult: "Defense result" }),
        "2016",
      ),
    ).toMatchObject({
      offenseSpecialResult: "Offense result",
      defenseSpecialResult: "Defense result",
    });
  });

  it("prints the team's offense tag, or none", () => {
    expect(cardText(team(), "2016").offenseTag).toBeNull();
    expect(cardText(team({ offenseTag: "R+" }), "2016").offenseTag).toBe("R+");
    expect(cardText(team({ offenseTag: "P" }), "2016").offenseTag).toBe("P");
  });

  it("never carries grades, ownership or a division", () => {
    const text = JSON.stringify(cardText(team(), "2016"));

    expect(text).not.toMatch(/SAVVY|LOYAL|Grade|"A"|"B"/);
    expect(Object.keys(cardText(team(), "2016"))).not.toContain("divisionId");
  });
});

describe("textStep", () => {
  it("steps down as the text gets longer", () => {
    expect(textStep("Buffalo", CITY_STEPS)).toBe(0);
    expect(textStep("x".repeat(CITY_STEPS[0]), CITY_STEPS)).toBe(0);
    expect(textStep("x".repeat(CITY_STEPS[0] + 1), CITY_STEPS)).toBe(1);
    expect(textStep("x".repeat(CITY_STEPS[1]), CITY_STEPS)).toBe(1);
    expect(textStep("x".repeat(CITY_STEPS[1] + 1), CITY_STEPS)).toBe(2);
    expect(textStep("x".repeat(50), CITY_STEPS)).toBe(2);
  });

  it("gives the narrower team name fewer characters at each size", () => {
    expect(textStep("Blizzard", TEAM_NAME_STEPS)).toBe(0);
    expect(textStep("Thunderbirds", TEAM_NAME_STEPS)).toBe(1);
    expect(textStep("Thunderbirds", CITY_STEPS)).toBe(0);
    expect(textStep("Fighting Thunderbirds", TEAM_NAME_STEPS)).toBe(2);
  });
});

describe("cardColors", () => {
  it("fills with a dark color and prints white on it", () => {
    expect(cardColors("#003594", "#c8102e")).toMatchObject({
      primary: { fill: "#003594", border: "#003594", text: "#ffffff" },
      secondary: { fill: "#c8102e", border: "#c8102e", text: "#ffffff" },
    });
  });

  it("prints names and labels in the other color when the two colors are far enough apart", () => {
    // Black and gold: the city is gold on black, the team name black on gold.
    expect(cardColors("#000000", "#ffb612")).toMatchObject({
      primary: { accent: "#ffb612", text: "#ffffff" },
      secondary: { accent: "#000000", text: "#000000" },
    });
    // Navy and white: the city is white on navy, the team name navy on paper.
    expect(cardColors("#0b2265", "#ffffff")).toMatchObject({
      primary: { accent: "#ffffff" },
      secondary: { accent: "#0b2265" },
    });
  });

  it("prints names and labels in the plain text color when the two colors are too close", () => {
    // Royal blue and red have a contrast of about 1.9.
    expect(cardColors("#003594", "#c8102e")).toMatchObject({
      primary: { accent: "#ffffff" },
      secondary: { accent: "#ffffff" },
    });
    expect(cardColors("#ffb612", "#ffd100")).toMatchObject({
      primary: { accent: "#000000" },
      secondary: { accent: "#000000" },
    });
  });

  it("prints white on teal and orange, as the sample card does", () => {
    expect(cardColors("#008e97", "#f26522").primary.text).toBe("#ffffff");
    expect(cardColors("#008e97", "#f26522").secondary.text).toBe("#ffffff");
  });

  it("fills with gold or yellow and prints black on it", () => {
    for (const light of ["#ffb612", "#ffd100", "#a5acaf", "#69b3e7"]) {
      expect(cardColors("#000000", light).secondary, light).toEqual({
        fill: light,
        border: light,
        text: "#000000",
        accent: "#000000",
      });
    }
  });

  it("outlines a white secondary in the primary color", () => {
    expect(cardColors("#203731", "#ffffff").secondary).toEqual({
      fill: CARD_PAPER,
      border: "#203731",
      text: "#203731",
      accent: "#203731",
    });
  });

  it("outlines a white primary in the secondary color", () => {
    expect(cardColors("#ffffff", "#c8102e").primary).toEqual({
      fill: CARD_PAPER,
      border: "#c8102e",
      text: "#c8102e",
      accent: "#c8102e",
    });
  });

  it("outlines in near-black when the other color is too light to read", () => {
    const ink = { fill: CARD_PAPER, border: CARD_INK, text: CARD_INK, accent: CARD_INK };
    expect(cardColors("#fefefe", "#ffffff")).toEqual({ primary: ink, secondary: ink });
    expect(cardColors("#ffd100", "#ffffff").secondary).toEqual(ink);
  });

  it("keeps every palette pair readable", () => {
    for (const primary of PALETTE) {
      for (const secondary of PALETTE) {
        if (primary === secondary) continue;
        const colors = cardColors(primary.hex, secondary.hex);
        for (const drawn of [colors.primary, colors.secondary]) {
          const label = `${primary.name} and ${secondary.name}`;
          expect(contrast(drawn.text, drawn.fill), label).toBeGreaterThanOrEqual(3);
          expect(contrast(drawn.accent, drawn.fill), label).toBeGreaterThanOrEqual(3);
          expect(contrast(drawn.border, CARD_PAPER), label).toBeGreaterThanOrEqual(1.25);
        }
      }
    }
  });
});

describe("cardSheets", () => {
  it("returns no sheets for no cards", () => {
    expect(cardSheets([])).toEqual([]);
  });

  it.each([
    [1, [1]],
    [6, [6]],
    [7, [6, 1]],
    [8, [6, 2]],
    [32, [6, 6, 6, 6, 6, 2]],
  ])("splits %i cards into sheets of six in order", (count, sizes) => {
    const cards = Array.from({ length: count }, (_, index) => index);
    const sheets = cardSheets(cards);
    expect(sheets.map((sheet) => sheet.length)).toEqual(sizes);
    expect(sheets.flat()).toEqual(cards);
  });
});
