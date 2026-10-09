export type XpKickDistance = 2 | 15;

export type DivisionInput = { name: string; teamCount: number };
export type ConferenceInput = { name: string; divisions: DivisionInput[] };

export type LeagueStructure =
  | { kind: "none" }
  | { kind: "divisions"; divisions: DivisionInput[] }
  | { kind: "conferences"; conferences: ConferenceInput[] };

export type LeagueSetupInput = {
  name: string;
  seasonLabel: string;
  xpKickDistance: XpKickDistance;
  teamCount: number;
  structure: LeagueStructure;
};

export type FieldError = { field: string; message: string };

// What a Server Action returns when it does not redirect.
export type ActionFailure = {
  success: false;
  error?: string;
  fieldErrors?: FieldError[];
};

export type ValidationResult =
  | { ok: true; value: LeagueSetupInput }
  | { ok: false; errors: FieldError[] };

export const MIN_TEAMS = 8;
export const MAX_TEAMS = 56;
export const LEAGUE_NAME_MAX = 100;
export const SEASON_LABEL_MAX = 30;
export const GROUP_NAME_MAX = 50;

// Extra points moved back to the 15-yard line in 2015.
const FIRST_15_YARD_YEAR = 2015;

export function defaultXpKickDistance(label: string): XpKickDistance {
  const trimmed = label.trim();
  return /^\d{4}$/.test(trimmed) && Number(trimmed) >= FIRST_15_YARD_YEAR ? 15 : 2;
}

type TextCheck = { value: string; error: string | null };

// The one rule for a name typed by hand: trimmed, required, and limited. The
// setup form and every later edit report it in the same words.
function checkText(value: unknown, label: string, max: number): TextCheck {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return { value: trimmed, error: `${label} is required.` };
  if (trimmed.length > max) {
    return { value: trimmed, error: `${label} must be ${max} characters or fewer.` };
  }
  return { value: trimmed, error: null };
}

const LEAGUE_TEXT = {
  name: { label: "League name", max: LEAGUE_NAME_MAX },
  seasonLabel: { label: "Season label", max: SEASON_LABEL_MAX },
} as const;

export type LeagueTextField = keyof typeof LEAGUE_TEXT;

export type LeagueTextValidation =
  | { ok: true; field: LeagueTextField; value: string }
  | { ok: false; error: string };

// Accepts untrusted input from a Server Action.
export function validateLeagueText(field: unknown, value: unknown): LeagueTextValidation {
  if (typeof field !== "string" || !Object.hasOwn(LEAGUE_TEXT, field)) {
    return { ok: false, error: "That league could not be found." };
  }
  const key = field as LeagueTextField;
  const { value: text, error } = checkText(value, LEAGUE_TEXT[key].label, LEAGUE_TEXT[key].max);
  return error === null ? { ok: true, field: key, value: text } : { ok: false, error };
}

export type GroupKind = "conference" | "division";

export type GroupNameValidation =
  | { ok: true; kind: GroupKind; value: string }
  | { ok: false; error: string };

const GROUP_LABELS: Record<GroupKind, string> = {
  conference: "Conference name",
  division: "Division name",
};

// Accepts untrusted input from a Server Action.
export function validateGroupName(kind: unknown, value: unknown): GroupNameValidation {
  if (kind !== "conference" && kind !== "division") {
    return { ok: false, error: "That group could not be found." };
  }
  const { value: text, error } = checkText(value, GROUP_LABELS[kind], GROUP_NAME_MAX);
  return error === null ? { ok: true, kind, value: text } : { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Accepts untrusted input: the Server Action passes parsed JSON straight in.
export function validateLeagueSetup(input: unknown): ValidationResult {
  const errors: FieldError[] = [];
  const source = isRecord(input) ? input : {};

  function text(value: unknown, field: string, label: string, max: number): string {
    const { value: trimmed, error } = checkText(value, label, max);
    if (error !== null) errors.push({ field, message: error });
    return trimmed;
  }

  function divisions(value: unknown, prefix: string): DivisionInput[] {
    if (!Array.isArray(value)) return [];
    return value.map((entry, index) => {
      const division = isRecord(entry) ? entry : {};
      const field = `${prefix}.${index}`;
      const name = text(division.name, `${field}.name`, "Division name", GROUP_NAME_MAX);
      const count = division.teamCount;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
        errors.push({
          field: `${field}.teamCount`,
          message: "Teams must be a whole number of at least 1.",
        });
        return { name, teamCount: 0 };
      }
      return { name, teamCount: count };
    });
  }

  const name = text(source.name, "name", "League name", LEAGUE_NAME_MAX);
  const seasonLabel = text(source.seasonLabel, "seasonLabel", "Season label", SEASON_LABEL_MAX);

  const xpKickDistance = source.xpKickDistance;
  if (xpKickDistance !== 2 && xpKickDistance !== 15) {
    errors.push({ field: "xpKickDistance", message: "Choose the 2-yard or 15-yard line." });
  }

  const teamCount = source.teamCount;
  const teamCountValid =
    typeof teamCount === "number" &&
    Number.isInteger(teamCount) &&
    teamCount >= MIN_TEAMS &&
    teamCount <= MAX_TEAMS;
  if (!teamCountValid) {
    errors.push({
      field: "teamCount",
      message: `Number of teams must be a whole number from ${MIN_TEAMS} to ${MAX_TEAMS}.`,
    });
  }

  const rawStructure = isRecord(source.structure) ? source.structure : {};
  let structure: LeagueStructure = { kind: "none" };
  let grouped: DivisionInput[] | null = null;

  if (rawStructure.kind === "divisions") {
    const list = divisions(rawStructure.divisions, "divisions");
    if (list.length === 0) {
      errors.push({ field: "structure", message: "Add at least one division." });
    }
    structure = { kind: "divisions", divisions: list };
    grouped = list;
  } else if (rawStructure.kind === "conferences") {
    const rawConferences = Array.isArray(rawStructure.conferences)
      ? rawStructure.conferences
      : [];
    if (rawConferences.length === 0) {
      errors.push({ field: "structure", message: "Add at least one conference." });
    }
    const conferences = rawConferences.map((entry, index) => {
      const conference = isRecord(entry) ? entry : {};
      const field = `conferences.${index}`;
      const conferenceName = text(
        conference.name,
        `${field}.name`,
        "Conference name",
        GROUP_NAME_MAX,
      );
      const list = divisions(conference.divisions, `${field}.divisions`);
      if (list.length === 0) {
        errors.push({
          field: `${field}.divisions`,
          message: "Each conference needs at least one division.",
        });
      }
      return { name: conferenceName, divisions: list };
    });
    structure = { kind: "conferences", conferences };
    grouped = conferences.flatMap((conference) => conference.divisions);
  } else if (rawStructure.kind !== "none") {
    errors.push({ field: "structure", message: "Choose a league structure." });
  }

  // Only meaningful once every count is itself valid.
  if (
    grouped !== null &&
    grouped.length > 0 &&
    teamCountValid &&
    grouped.every((division) => division.teamCount >= 1)
  ) {
    const total = grouped.reduce((sum, division) => sum + division.teamCount, 0);
    if (total !== teamCount) {
      errors.push({
        field: "structure",
        message: `Division teams add up to ${total}, but the league has ${teamCount} teams.`,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      seasonLabel,
      xpKickDistance: xpKickDistance as XpKickDistance,
      teamCount: teamCount as number,
      structure,
    },
  };
}
