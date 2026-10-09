import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/leagues", () => ({
  deleteLeague: vi.fn(),
  renameConference: vi.fn(),
  renameDivision: vi.fn(),
  updateLeagueName: vi.fn(),
  updateSeasonLabel: vi.fn(),
}));
vi.mock("@/lib/runs", () => ({
  acceptLeague: vi.fn(),
  generateLeague: vi.fn(),
  rerollLeague: vi.fn(),
}));
vi.mock("@/lib/teams", () => ({
  fillTeams: vi.fn(),
  rerollTeamField: vi.fn(),
  updateTeamField: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteLeague,
  renameConference,
  renameDivision,
  updateLeagueName,
  updateSeasonLabel,
} from "@/lib/leagues";
import { acceptLeague, generateLeague, rerollLeague } from "@/lib/runs";
import { fillTeams, rerollTeamField, updateTeamField, type Team } from "@/lib/teams";
import {
  acceptLeagueAction,
  deleteLeagueAction,
  fillTeamsAction,
  generateLeagueAction,
  rerollLeagueAction,
  renameGroupAction,
  rerollTeamFieldAction,
  updateLeagueTextAction,
  updateTeamFieldAction,
} from "./actions";

const TEAM_NOT_FOUND = { success: false, error: "That team could not be found." };
const SAVE_FAILED = { success: false, error: "Something went wrong. Try again." };
const LEAGUE_NOT_FOUND = { success: false, error: "That league could not be found." };
const BAD_IDS = [0, -1, 1.5, Number.NaN, "7", null, undefined] as unknown as number[];

const team: Team = {
  id: 7,
  franchiseId: 7,
  divisionId: null,
  position: 0,
  city: "Chicago",
  nickname: "Aces",
  headCoachName: "Adam Adams",
  primaryColor: "#000000",
  secondaryColor: "#ffffff",
  offenseTag: null,
  ownershipStyle: null,
  ownershipLoyalty: null,
  frontOfficeGrade: null,
  headCoachGrade: null,
  offenseProfile: null,
  offenseQualities: null,
  defenseProfile: null,
  defenseQualities: null,
  kickReturn: null,
  puntReturn: null,
  fgRange: null,
  xpRange: null,
};

function failing(): never {
  throw new Error("SQLITE_FULL: secret detail");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("deleteLeagueAction", () => {
  it.each(BAD_IDS)("rejects the id %j without deleting", async (id) => {
    const result = await deleteLeagueAction(id);

    expect(result).toEqual({ success: false, error: "That league could not be found." });
    expect(deleteLeague).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message and does not redirect", async () => {
    vi.mocked(deleteLeague).mockImplementation(failing);

    const result = await deleteLeagueAction(3);

    expect(result).toEqual({
      success: false,
      error: "The league could not be deleted. Nothing was removed. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain("SQLITE_FULL");
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("deletes the league and returns to the league list", async () => {
    await deleteLeagueAction(3);

    expect(deleteLeague).toHaveBeenCalledWith({}, 3);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(redirect).toHaveBeenCalledWith("/");
  });
});

describe("updateTeamFieldAction", () => {
  it.each(BAD_IDS)("rejects the team id %j", async (id) => {
    expect(await updateTeamFieldAction(id, "city", "Chicago")).toEqual(TEAM_NOT_FOUND);
    expect(updateTeamField).not.toHaveBeenCalled();
  });

  it.each(["colors", "id", "", undefined])("rejects the field %j", async (field) => {
    expect(await updateTeamFieldAction(7, field as string, "Chicago")).toEqual(TEAM_NOT_FOUND);
    expect(updateTeamField).not.toHaveBeenCalled();
  });

  it.each([
    "offenseProfile",
    "offenseQualities",
    "defenseProfile",
    "defenseQualities",
    "frontOfficeGrade",
    "headCoachGrade",
    "ownershipStyle",
    "ownershipLoyalty",
    "kickReturn",
    "puntReturn",
    "fgRange",
    "xpRange",
  ])("locks the rule-generated field %s", async (field) => {
    expect(await updateTeamFieldAction(7, field, "STAUNCH")).toEqual(TEAM_NOT_FOUND);
    expect(updateTeamField).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saves and clears an offense tag", async () => {
    vi.mocked(updateTeamField).mockReturnValue(true);

    expect(await updateTeamFieldAction(7, "offenseTag", " R+ ")).toEqual({ success: true });
    expect(updateTeamField).toHaveBeenLastCalledWith({}, 7, "offenseTag", "R+");
    expect(await updateTeamFieldAction(7, "offenseTag", "")).toEqual({ success: true });
    expect(updateTeamField).toHaveBeenLastCalledWith({}, 7, "offenseTag", null);
  });

  it.each(["X", "r", undefined])("rejects the offense tag %j and saves nothing", async (tag) => {
    expect(await updateTeamFieldAction(7, "offenseTag", tag as string)).toEqual({
      success: false,
      error: "Choose an offense tag.",
    });
    expect(updateTeamField).not.toHaveBeenCalled();
  });

  it("returns the validation message for a bad value and saves nothing", async () => {
    expect(await updateTeamFieldAction(7, "city", "   ")).toEqual({
      success: false,
      error: "Enter a city.",
    });
    expect(await updateTeamFieldAction(7, "primaryColor", "red")).toEqual({
      success: false,
      error: "Choose a color.",
    });
    expect(updateTeamField).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports an unknown team without refreshing the page", async () => {
    vi.mocked(updateTeamField).mockReturnValue(false);

    expect(await updateTeamFieldAction(7, "city", "Chicago")).toEqual(TEAM_NOT_FOUND);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message", async () => {
    vi.mocked(updateTeamField).mockImplementation(failing);

    const result = await updateTeamFieldAction(7, "city", "Chicago");

    expect(result).toEqual(SAVE_FAILED);
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saves the cleaned value and refreshes the league page", async () => {
    vi.mocked(updateTeamField).mockReturnValue(true);

    expect(await updateTeamFieldAction(7, "primaryColor", " #FFB612 ")).toEqual({
      success: true,
    });
    expect(updateTeamField).toHaveBeenCalledWith({}, 7, "primaryColor", "#ffb612");
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]", "page");
  });
});

describe("updateLeagueTextAction", () => {
  it.each(BAD_IDS)("rejects the league id %j", async (id) => {
    expect(await updateLeagueTextAction(id, "name", "Continental")).toEqual(LEAGUE_NOT_FOUND);
    expect(updateLeagueName).not.toHaveBeenCalled();
    expect(updateSeasonLabel).not.toHaveBeenCalled();
  });

  it.each(["teamCount", "xpKickDistance", "id", "", undefined])(
    "rejects the field %j",
    async (field) => {
      expect(await updateLeagueTextAction(3, field as string, "Continental")).toEqual(
        LEAGUE_NOT_FOUND,
      );
      expect(updateLeagueName).not.toHaveBeenCalled();
      expect(updateSeasonLabel).not.toHaveBeenCalled();
    },
  );

  it("returns the validation message for a bad value and saves nothing", async () => {
    expect(await updateLeagueTextAction(3, "name", "   ")).toEqual({
      success: false,
      error: "League name is required.",
    });
    expect(await updateLeagueTextAction(3, "seasonLabel", "x".repeat(31))).toEqual({
      success: false,
      error: "Season label must be 30 characters or fewer.",
    });
    expect(updateLeagueName).not.toHaveBeenCalled();
    expect(updateSeasonLabel).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports an unknown league without refreshing any page", async () => {
    vi.mocked(updateLeagueName).mockReturnValue(false);
    vi.mocked(updateSeasonLabel).mockReturnValue(false);

    expect(await updateLeagueTextAction(3, "name", "Continental")).toEqual(LEAGUE_NOT_FOUND);
    expect(await updateLeagueTextAction(3, "seasonLabel", "2016")).toEqual(LEAGUE_NOT_FOUND);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message", async () => {
    vi.mocked(updateLeagueName).mockImplementation(failing);

    expect(await updateLeagueTextAction(3, "name", "Continental")).toEqual(SAVE_FAILED);
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saves the trimmed name and refreshes every page that shows it", async () => {
    vi.mocked(updateLeagueName).mockReturnValue(true);

    expect(await updateLeagueTextAction(3, "name", "  Continental  ")).toEqual({ success: true });
    expect(updateLeagueName).toHaveBeenCalledWith({}, 3, "Continental");
    expect(updateSeasonLabel).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]/cards", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("saves the trimmed season label", async () => {
    vi.mocked(updateSeasonLabel).mockReturnValue(true);

    expect(await updateLeagueTextAction(3, "seasonLabel", " 2016 ")).toEqual({ success: true });
    expect(updateSeasonLabel).toHaveBeenCalledWith({}, 3, "2016");
    expect(updateLeagueName).not.toHaveBeenCalled();
  });
});

describe("renameGroupAction", () => {
  it.each(BAD_IDS)("rejects the conference id %j", async (id) => {
    expect(await renameGroupAction("conference", id, "East")).toEqual({
      success: false,
      error: "That conference could not be found.",
    });
    expect(renameConference).not.toHaveBeenCalled();
  });

  it.each(BAD_IDS)("rejects the division id %j", async (id) => {
    expect(await renameGroupAction("division", id, "East")).toEqual({
      success: false,
      error: "That division could not be found.",
    });
    expect(renameDivision).not.toHaveBeenCalled();
  });

  it.each(["league", "team", "", undefined])("rejects the kind %j", async (kind) => {
    expect(await renameGroupAction(kind as string, 4, "East")).toEqual({
      success: false,
      error: "That group could not be found.",
    });
    expect(renameConference).not.toHaveBeenCalled();
    expect(renameDivision).not.toHaveBeenCalled();
  });

  it("returns the validation message for a bad name and saves nothing", async () => {
    expect(await renameGroupAction("conference", 4, "  ")).toEqual({
      success: false,
      error: "Conference name is required.",
    });
    expect(await renameGroupAction("division", 4, "x".repeat(51))).toEqual({
      success: false,
      error: "Division name must be 50 characters or fewer.",
    });
    expect(renameConference).not.toHaveBeenCalled();
    expect(renameDivision).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports an unknown conference or division without refreshing any page", async () => {
    vi.mocked(renameConference).mockReturnValue(false);
    vi.mocked(renameDivision).mockReturnValue(false);

    expect(await renameGroupAction("conference", 4, "East")).toEqual({
      success: false,
      error: "That conference could not be found.",
    });
    expect(await renameGroupAction("division", 4, "East")).toEqual({
      success: false,
      error: "That division could not be found.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message", async () => {
    vi.mocked(renameDivision).mockImplementation(failing);

    expect(await renameGroupAction("division", 4, "East")).toEqual(SAVE_FAILED);
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saves the trimmed name to the right table and refreshes the league pages", async () => {
    vi.mocked(renameConference).mockReturnValue(true);
    vi.mocked(renameDivision).mockReturnValue(true);

    expect(await renameGroupAction("conference", 4, " Eastern ")).toEqual({ success: true });
    expect(renameConference).toHaveBeenCalledWith({}, 4, "Eastern");
    expect(renameDivision).not.toHaveBeenCalled();
    expect(await renameGroupAction("division", 5, " Metro ")).toEqual({ success: true });
    expect(renameDivision).toHaveBeenCalledWith({}, 5, "Metro");
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]/cards", "page");
  });
});

describe("rerollTeamFieldAction", () => {
  it.each(BAD_IDS)("rejects the team id %j", async (id) => {
    expect(await rerollTeamFieldAction(id, "city")).toEqual(TEAM_NOT_FOUND);
    expect(rerollTeamField).not.toHaveBeenCalled();
  });

  it.each(["primaryColor", "id", "", undefined])("rejects the field %j", async (field) => {
    expect(await rerollTeamFieldAction(7, field as string)).toEqual(TEAM_NOT_FOUND);
    expect(rerollTeamField).not.toHaveBeenCalled();
  });

  it("reports an unknown team without refreshing the page", async () => {
    vi.mocked(rerollTeamField).mockReturnValue(null);

    expect(await rerollTeamFieldAction(7, "colors")).toEqual(TEAM_NOT_FOUND);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message", async () => {
    vi.mocked(rerollTeamField).mockImplementation(failing);

    expect(await rerollTeamFieldAction(7, "nickname")).toEqual(SAVE_FAILED);
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("re-rolls with the real random source and refreshes the league page", async () => {
    vi.mocked(rerollTeamField).mockReturnValue(team);

    expect(await rerollTeamFieldAction(7, "colors")).toEqual({ success: true });
    expect(rerollTeamField).toHaveBeenCalledWith({}, 7, "colors", Math.random);
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]", "page");
  });
});

describe("fillTeamsAction", () => {
  it.each(BAD_IDS)("rejects the league id %j", async (id) => {
    expect(await fillTeamsAction(id)).toEqual({
      success: false,
      error: "That league could not be found.",
    });
    expect(fillTeams).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message", async () => {
    vi.mocked(fillTeams).mockImplementation(failing);

    expect(await fillTeamsAction(3)).toEqual(SAVE_FAILED);
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fills the league and refreshes the league page", async () => {
    vi.mocked(fillTeams).mockReturnValue(8);

    expect(await fillTeamsAction(3)).toEqual({ success: true });
    expect(fillTeams).toHaveBeenCalledWith({}, 3, Math.random);
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]", "page");
  });
});

describe("generateLeagueAction", () => {
  it.each(BAD_IDS)("rejects the league id %j", async (id) => {
    expect(await generateLeagueAction(id)).toEqual(LEAGUE_NOT_FOUND);
    expect(generateLeague).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", "That league could not be found."],
    ["no-teams", "Fill in teams before generating the league."],
    ["already-generated", "This league has already been generated."],
  ] as const)("explains the %s result without refreshing the page", async (reason, error) => {
    vi.mocked(generateLeague).mockReturnValue({ ok: false, reason });

    expect(await generateLeagueAction(3)).toEqual({ success: false, error });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message", async () => {
    vi.mocked(generateLeague).mockImplementation(failing);

    expect(await generateLeagueAction(3)).toEqual(SAVE_FAILED);
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("generates with a whole 32-bit seed and refreshes the league page", async () => {
    vi.mocked(generateLeague).mockReturnValue({ ok: true, runId: 1 });

    expect(await generateLeagueAction(3)).toEqual({ success: true });
    const [, leagueId, seed] = vi.mocked(generateLeague).mock.calls[0];
    expect(leagueId).toBe(3);
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]", "page");
  });
});

describe("rerollLeagueAction", () => {
  it.each(BAD_IDS)("rejects the league id %j", async (id) => {
    expect(await rerollLeagueAction(id)).toEqual(LEAGUE_NOT_FOUND);
    expect(rerollLeague).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", "That league could not be found."],
    ["not-generated", "Generate this league first."],
    ["no-teams", "Fill in teams before generating the league."],
    ["accepted", "This league has been accepted and can no longer be re-rolled."],
  ] as const)("explains the %s result without refreshing the page", async (reason, error) => {
    vi.mocked(rerollLeague).mockReturnValue({ ok: false, reason });

    expect(await rerollLeagueAction(3)).toEqual({ success: false, error });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message", async () => {
    vi.mocked(rerollLeague).mockImplementation(failing);

    expect(await rerollLeagueAction(3)).toEqual(SAVE_FAILED);
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("re-rolls with a whole 32-bit seed and refreshes the league page", async () => {
    vi.mocked(rerollLeague).mockReturnValue({ ok: true, runId: 2 });

    expect(await rerollLeagueAction(3)).toEqual({ success: true });
    const [, leagueId, seed] = vi.mocked(rerollLeague).mock.calls[0];
    expect(leagueId).toBe(3);
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]", "page");
  });
});

describe("acceptLeagueAction", () => {
  it.each(BAD_IDS)("rejects the league id %j", async (id) => {
    expect(await acceptLeagueAction(id)).toEqual(LEAGUE_NOT_FOUND);
    expect(acceptLeague).not.toHaveBeenCalled();
  });

  it.each([
    ["not-found", "That league could not be found."],
    ["not-generated", "Generate this league first."],
    ["already-accepted", "This league has already been accepted."],
    ["incomplete", "This draft is incomplete. Re-roll the league, then accept it."],
  ] as const)("explains the %s result without refreshing the page", async (reason, error) => {
    vi.mocked(acceptLeague).mockReturnValue({ ok: false, reason });

    expect(await acceptLeagueAction(3)).toEqual({ success: false, error });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides a database failure behind a generic message", async () => {
    vi.mocked(acceptLeague).mockImplementation(failing);

    expect(await acceptLeagueAction(3)).toEqual(SAVE_FAILED);
    expect(console.error).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts the league and refreshes the league page", async () => {
    vi.mocked(acceptLeague).mockReturnValue({ ok: true });

    expect(await acceptLeagueAction(3)).toEqual({ success: true });
    expect(acceptLeague).toHaveBeenCalledWith({}, 3);
    expect(revalidatePath).toHaveBeenCalledWith("/leagues/[leagueId]", "page");
  });
});
