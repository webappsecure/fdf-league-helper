"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isRerollField, validateTeamField, type CellResult } from "@/lib/identity";
import { validateGroupName, validateLeagueText, type ActionFailure } from "@/lib/league-setup";
import {
  deleteLeague,
  renameConference,
  renameDivision,
  updateLeagueName,
  updateSeasonLabel,
} from "@/lib/leagues";
import { acceptLeague, generateLeague, rerollLeague } from "@/lib/runs";
import { fillTeams, rerollTeamField, updateTeamField } from "@/lib/teams";

const TEAM_NOT_FOUND: CellResult = { success: false, error: "That team could not be found." };
// Not typed as CellResult: deleteLeagueAction returns the same failure in its own shape.
const LEAGUE_NOT_FOUND = { success: false, error: "That league could not be found." } as const;
const SAVE_FAILED: CellResult = { success: false, error: "Something went wrong. Try again." };
const NOT_GENERATED: CellResult = { success: false, error: "Generate this league first." };
const NO_TEAMS: CellResult = {
  success: false,
  error: "Fill in teams before generating the league.",
};
// One past the largest seed the seeded random source accepts.
const SEED_LIMIT = 2 ** 32;

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function revalidateLeaguePages(): void {
  revalidatePath("/leagues/[leagueId]", "page");
  revalidatePath("/leagues/[leagueId]/cards", "page");
}

export async function updateTeamFieldAction(
  teamId: number,
  field: string,
  value: string,
): Promise<CellResult> {
  if (!isId(teamId)) return TEAM_NOT_FOUND;
  const result = validateTeamField(field, value);
  if (!result.ok) return { success: false, error: result.error };

  try {
    if (!updateTeamField(getDb(), teamId, result.field, result.value)) return TEAM_NOT_FOUND;
  } catch (error) {
    console.error(error);
    return SAVE_FAILED;
  }

  revalidateLeaguePages();
  return { success: true };
}

export async function updateLeagueTextAction(
  leagueId: number,
  field: string,
  value: string,
): Promise<CellResult> {
  if (!isId(leagueId)) return LEAGUE_NOT_FOUND;
  const result = validateLeagueText(field, value);
  if (!result.ok) return { success: false, error: result.error };

  try {
    const db = getDb();
    const found =
      result.field === "name"
        ? updateLeagueName(db, leagueId, result.value)
        : updateSeasonLabel(db, leagueId, result.value);
    if (!found) return LEAGUE_NOT_FOUND;
  } catch (error) {
    console.error(error);
    return SAVE_FAILED;
  }

  revalidateLeaguePages();
  // The league list shows both.
  revalidatePath("/");
  return { success: true };
}

export async function renameGroupAction(
  kind: string,
  groupId: number,
  name: string,
): Promise<CellResult> {
  const result = validateGroupName(kind, name);
  if (!result.ok) return { success: false, error: result.error };
  if (!isId(groupId)) return { success: false, error: `That ${result.kind} could not be found.` };

  try {
    const db = getDb();
    const found =
      result.kind === "conference"
        ? renameConference(db, groupId, result.value)
        : renameDivision(db, groupId, result.value);
    if (!found) return { success: false, error: `That ${result.kind} could not be found.` };
  } catch (error) {
    console.error(error);
    return SAVE_FAILED;
  }

  revalidateLeaguePages();
  return { success: true };
}

export async function rerollTeamFieldAction(teamId: number, field: string): Promise<CellResult> {
  if (!isId(teamId) || !isRerollField(field)) return TEAM_NOT_FOUND;

  try {
    if (!rerollTeamField(getDb(), teamId, field, Math.random)) return TEAM_NOT_FOUND;
  } catch (error) {
    console.error(error);
    return SAVE_FAILED;
  }

  revalidateLeaguePages();
  return { success: true };
}

export async function fillTeamsAction(leagueId: number): Promise<CellResult> {
  if (!isId(leagueId)) return LEAGUE_NOT_FOUND;

  try {
    fillTeams(getDb(), leagueId, Math.random);
  } catch (error) {
    console.error(error);
    return SAVE_FAILED;
  }

  revalidateLeaguePages();
  return { success: true };
}

export async function deleteLeagueAction(leagueId: number): Promise<ActionFailure | null> {
  if (!isId(leagueId)) return LEAGUE_NOT_FOUND;

  try {
    deleteLeague(getDb(), leagueId);
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: "The league could not be deleted. Nothing was removed. Please try again.",
    };
  }

  revalidatePath("/");
  redirect("/");
}

export async function generateLeagueAction(leagueId: number): Promise<CellResult> {
  if (!isId(leagueId)) return LEAGUE_NOT_FOUND;

  let result;
  try {
    result = generateLeague(getDb(), leagueId, randomInt(SEED_LIMIT));
  } catch (error) {
    console.error(error);
    return SAVE_FAILED;
  }

  if (!result.ok) {
    if (result.reason === "not-found") return LEAGUE_NOT_FOUND;
    if (result.reason === "no-teams") return NO_TEAMS;
    return { success: false, error: "This league has already been generated." };
  }

  revalidateLeaguePages();
  return { success: true };
}

export async function rerollLeagueAction(leagueId: number): Promise<CellResult> {
  if (!isId(leagueId)) return LEAGUE_NOT_FOUND;

  let result;
  try {
    result = rerollLeague(getDb(), leagueId, randomInt(SEED_LIMIT));
  } catch (error) {
    console.error(error);
    return SAVE_FAILED;
  }

  if (!result.ok) {
    if (result.reason === "not-found") return LEAGUE_NOT_FOUND;
    if (result.reason === "not-generated") return NOT_GENERATED;
    if (result.reason === "no-teams") return NO_TEAMS;
    return {
      success: false,
      error: "This league has been accepted and can no longer be re-rolled.",
    };
  }

  revalidateLeaguePages();
  return { success: true };
}

export async function acceptLeagueAction(leagueId: number): Promise<CellResult> {
  if (!isId(leagueId)) return LEAGUE_NOT_FOUND;

  let result;
  try {
    result = acceptLeague(getDb(), leagueId);
  } catch (error) {
    console.error(error);
    return SAVE_FAILED;
  }

  if (!result.ok) {
    if (result.reason === "not-found") return LEAGUE_NOT_FOUND;
    if (result.reason === "not-generated") return NOT_GENERATED;
    return {
      success: false,
      error:
        result.reason === "incomplete"
          ? "This draft is incomplete. Re-roll the league, then accept it."
          : "This league has already been accepted.",
    };
  }

  revalidateLeaguePages();
  return { success: true };
}
