import { shuffle } from "@/lib/dice";
import type { Grade } from "@/lib/reference/management-tables";
import {
  DRAFT_PROFILES,
  FOOTNOTE_AWARDS,
  OFFENSE_PAIRS,
  PROFILE_LABELS,
  TABLE_C,
  inPairOrder,
  qualityLabel,
  type DraftProfile,
  type OffenseProfile,
  type OffenseQuality,
  type Quality,
  type Strength,
} from "@/lib/reference/offense-tables";
import {
  draftProfiles as draftSideProfiles,
  draftRemainingQualities as draftSideQualities,
  type Card,
  type Draft,
  type Side,
} from "@/lib/rules/draft";

export type OffenseResult = {
  franchiseId: number;
  offenseProfile: OffenseProfile;
  offenseQualities: Quality[];
  pointsLeft: number;
};

export const OFFENSE: Side<DraftProfile, OffenseQuality> = {
  of: (card) => card.offense,
  profileStep: "offense-profile",
  qualitiesStep: "offense-qualities",
  profileStepNumber: 9,
  profiles: DRAFT_PROFILES,
  labels: PROFILE_LABELS,
  table: TABLE_C,
  footnoteAwards: FOOTNOTE_AWARDS,
  remainingPairs: OFFENSE_PAIRS.slice(2, 5),
};

export function draftResults(draft: Draft): OffenseResult[] {
  return draft.cards.map((card) => ({
    franchiseId: card.franchiseId,
    offenseProfile: card.offense.profile,
    offenseQualities: inPairOrder(card.offense.qualities),
    pointsLeft: card.points,
  }));
}

// Step 9, with Table C.
export function draftProfiles(draft: Draft): void {
  draftSideProfiles(draft, OFFENSE);
}

// Step 10: RELIABLE or SHAKY, SECURE or CLUMSY, DISCIPLINED or UNDISCIPLINED.
export function draftRemainingQualities(draft: Draft): void {
  draftSideQualities(draft, OFFENSE);
}

// Step 11 (training camp step 5). No Franchise Points may be spent here. The
// teams whose coach has one of `inefficientGrades` join the INEFFICIENT stack:
// D at league creation, D or F in training camp.
export function draftEfficiency(draft: Draft, inefficientGrades: Grade[] = ["D"]): void {
  const step = "efficiency";
  const say = (card: Card, message: string) =>
    draft.log.push({ step, franchiseId: card.franchiseId, message });

  // Steps A to C, then D to F: draw 2 x QV at random, add every undrawn team
  // whose coach has the grade, shuffle that stack and deal QV full then QV semi.
  const assign = (
    pool: Card[],
    [first, second, third]: string,
    grades: Grade[],
    quality: OffenseQuality,
  ) => {
    const deck = shuffle(pool, draft.rng);
    const drawn = deck.splice(0, 2 * draft.qv);
    for (const card of drawn) say(card, `Step ${first}: drew ${card.teamName}.`);

    const graded = deck.filter((card) => grades.includes(card.headCoachGrade));
    for (const card of graded) {
      say(
        card,
        `Step ${second}: ${card.teamName} joins the stack with a Head Coach Grade ` +
          `${card.headCoachGrade}.`,
      );
    }

    const stack = shuffle([...drawn, ...graded], draft.rng);
    const deal = (letter: string, strength: Strength) => {
      for (const card of stack.splice(0, draft.qv)) {
        card.offense.qualities.push({ quality, strength });
        say(card, `Step ${letter}: ${card.teamName} receives ${qualityLabel({ quality, strength })}.`);
      }
    };
    deal(second, "FULL");
    deal(third, "SEMI");
  };

  assign(draft.cards, "ABC", ["A"], "EFFICIENT");
  const remaining = draft.cards.filter(
    (card) => !card.offense.qualities.some((entry) => entry.quality === "EFFICIENT"),
  );
  assign(remaining, "DEF", inefficientGrades, "INEFFICIENT");
}

// Steps 8 to 11 on an open draft: the QV and CDV line, then the offense.
export function runOffenseDraft(draft: Draft): void {
  draft.log.push({
    step: "qv-cdv",
    franchiseId: null,
    message: `${draft.cards.length} teams: QV ${draft.qv}, CDV ${draft.cdv}.`,
  });
  draftProfiles(draft);
  draftRemainingQualities(draft);
  draftEfficiency(draft);
}
