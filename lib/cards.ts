import { DEFENSE_PROFILE_LABELS, type DefenseProfile } from "@/lib/reference/defense-tables";
import { PROFILE_LABELS, type OffenseProfile } from "@/lib/reference/offense-tables";
import { qualityLabel, type Quality } from "@/lib/reference/profile-tables";
import { resultLabel } from "@/lib/reference/special-teams-tables";
import type { Team } from "@/lib/teams";

// A team whose whole draft is stored, which is what a card needs.
export type CardTeam = Team & {
  offenseProfile: OffenseProfile;
  defenseProfile: DefenseProfile;
  fgRange: string;
  xpRange: string;
};

export function isCardTeam(team: Team): team is CardTeam {
  return (
    team.offenseProfile !== null &&
    team.defenseProfile !== null &&
    team.fgRange !== null &&
    team.xpRange !== null
  );
}

// Everything printed on a card, as text. Empty strings print nothing.
export type CardText = {
  city: string;
  coachLine: string;
  teamName: string;
  seasonLabel: string;
  // The profile first unless it is AVERAGE, then the qualities in card order.
  offense: string[];
  defense: string[];
  // Set by the user, for example "R+". Printed as OFFENSE [R+].
  offenseTag: string | null;
  // Table G results from feature 13, printed under their side's list.
  offenseSpecialResult: string | null;
  defenseSpecialResult: string | null;
  kickReturn: string;
  puntReturn: string;
  fgRange: string;
  xpRange: string;
};

// The profile (unless AVERAGE, which is no profile) then the qualities in card
// order. The profile is a quality like any other, so every view lists it so.
export function listed(profileLabel: string, qualities: Quality[] | null): string[] {
  const lines = (qualities ?? []).map(qualityLabel);
  return profileLabel === "AVERAGE" ? lines : [profileLabel, ...lines];
}

// The same list as one line for a table cell, or "None" when there is nothing.
export function listedText(profileLabel: string, qualities: Quality[] | null): string {
  const lines = listed(profileLabel, qualities);
  return lines.length > 0 ? lines.join(", ") : "None";
}

export function cardText(team: CardTeam, seasonLabel: string): CardText {
  return {
    city: team.city,
    coachLine: `Head Coach: ${team.headCoachName}`,
    teamName: team.nickname,
    seasonLabel,
    offense: listed(PROFILE_LABELS[team.offenseProfile], team.offenseQualities),
    defense: listed(DEFENSE_PROFILE_LABELS[team.defenseProfile], team.defenseQualities),
    offenseTag: team.offenseTag,
    offenseSpecialResult: team.offenseSpecialResult,
    defenseSpecialResult: team.defenseSpecialResult,
    kickReturn: team.kickReturn ? resultLabel(team.kickReturn) : "",
    puntReturn: team.puntReturn ? resultLabel(team.puntReturn) : "",
    fgRange: team.fgRange,
    xpRange: team.xpRange,
  };
}

// Header text comes in three sizes. Longer text takes a smaller one, and the
// smallest wraps to two lines.
export type TextStep = 0 | 1 | 2;

// The longest text, in characters, that fits at the large and medium sizes.
export const CITY_STEPS = [13, 20] as const;
export const TEAM_NAME_STEPS = [9, 14] as const;

export function textStep(text: string, [large, medium]: readonly [number, number]): TextStep {
  if (text.length <= large) return 0;
  return text.length <= medium ? 1 : 2;
}

export const CARD_PAPER = "#ffffff";
export const CARD_INK = "#171717";

// Below this contrast against the paper a fill cannot be seen, so the shape is
// drawn as an outline instead. White and near-white fall under it; yellow and
// gold do not.
export const MIN_FILL_CONTRAST = 1.25;
// The sample card prints white on every fill that can carry it and switches to
// black only on light fills such as gold. This is the WCAG level for large
// bold text.
export const MIN_WHITE_TEXT_CONTRAST = 3;
// An outline and its text take the team's other color when that reads well on
// the paper.
export const MIN_INK_CONTRAST = 3;

// WCAG relative luminance of a #rrggbb color.
function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// The city, the team name and the bar and box labels are printed in the
// team's other color when the two colors are this far apart, and in the plain
// text color when they are not.
export const MIN_ACCENT_CONTRAST = 3;

// How one of a team's two colors is drawn on the card. An outlined surface
// has the paper as its fill. `accent` colors the large header line and the
// labels printed on it: the city and the OFFENSE and DEFENSE labels on the
// primary, the team name and the KR, PR, FG and XP labels on the secondary.
// `text` colors the coach line and the season label.
export type Surface = { fill: string; border: string; text: string; accent: string };

function surface(color: string, other: string): Surface {
  if (contrast(color, CARD_PAPER) >= MIN_FILL_CONTRAST) {
    const text = contrast(color, "#ffffff") >= MIN_WHITE_TEXT_CONTRAST ? "#ffffff" : "#000000";
    const accent = contrast(other, color) >= MIN_ACCENT_CONTRAST ? other : text;
    return { fill: color, border: color, text, accent };
  }
  const ink = contrast(other, CARD_PAPER) >= MIN_INK_CONTRAST ? other : CARD_INK;
  return { fill: CARD_PAPER, border: ink, text: ink, accent: ink };
}

// The primary color draws the left of the header and the two bars, the
// secondary the right of the header and the four boxes.
export function cardColors(
  primaryColor: string,
  secondaryColor: string,
): { primary: Surface; secondary: Surface } {
  return {
    primary: surface(primaryColor, secondaryColor),
    secondary: surface(secondaryColor, primaryColor),
  };
}

// A printed letter page holds two columns and three rows of cards.
export const CARDS_PER_SHEET = 6;

// Splits cards into printed sheets, in order. The last sheet holds the rest.
export function cardSheets<T>(cards: T[]): T[][] {
  const sheets: T[][] = [];
  for (let start = 0; start < cards.length; start += CARDS_PER_SHEET) {
    sheets.push(cards.slice(start, start + CARDS_PER_SHEET));
  }
  return sheets;
}
