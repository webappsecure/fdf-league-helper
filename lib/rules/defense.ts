import {
  DEFENSE_DRAFT_PROFILES,
  DEFENSE_FOOTNOTE_AWARDS,
  DEFENSE_PAIRS,
  DEFENSE_PROFILE_LABELS,
  TABLE_D,
  inDefensePairOrder,
  type DefenseDraftProfile,
  type DefenseProfile,
  type DefenseQuality,
  type DefenseQualityName,
} from "@/lib/reference/defense-tables";
import {
  draftProfiles,
  draftRemainingQualities,
  type Draft,
  type Side,
} from "@/lib/rules/draft";

export type DefenseResult = {
  franchiseId: number;
  defenseProfile: DefenseProfile;
  defenseQualities: DefenseQuality[];
};

const DEFENSE: Side<DefenseDraftProfile, DefenseQualityName> = {
  of: (card) => card.defense,
  profileStep: "defense-profile",
  qualitiesStep: "defense-qualities",
  profileStepNumber: 12,
  profiles: DEFENSE_DRAFT_PROFILES,
  labels: DEFENSE_PROFILE_LABELS,
  table: TABLE_D,
  footnoteAwards: DEFENSE_FOOTNOTE_AWARDS,
  remainingPairs: DEFENSE_PAIRS.slice(2),
};

// Step 12, with Table D.
export function draftDefenseProfiles(draft: Draft): void {
  draftProfiles(draft, DEFENSE);
}

// Step 13: AGGRESSIVE or MEEK, ACTIVE or PASSIVE, DISCIPLINED or UNDISCIPLINED.
export function draftRemainingDefenseQualities(draft: Draft): void {
  draftRemainingQualities(draft, DEFENSE);
}

// Steps 12 and 13 on a draft whose teams carry the Franchise Points the
// offense draft left them.
export function runDefenseDraft(draft: Draft): void {
  draftDefenseProfiles(draft);
  draftRemainingDefenseQualities(draft);
}

export function defenseResults(draft: Draft): DefenseResult[] {
  return draft.cards.map((card) => ({
    franchiseId: card.franchiseId,
    defenseProfile: card.defense.profile,
    defenseQualities: inDefensePairOrder(card.defense.qualities),
  }));
}
