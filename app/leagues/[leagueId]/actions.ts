"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isRerollField, validateTeamField, type CellResult } from "@/lib/identity";
import type { ActionFailure } from "@/lib/league-setup";
import { deleteLeague } from "@/lib/leagues";
import { fillTeams, rerollTeamField, updateTeamField } from "@/lib/teams";

const TEAM_NOT_FOUND: CellResult = { success: false, error: "That team could not be found." };
const SAVE_FAILED: CellResult = { success: false, error: "Something went wrong. Try again." };

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function revalidateLeaguePages(): void {
  revalidatePath("/leagues/[leagueId]", "page");
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
  if (!isId(leagueId)) return { success: false, error: "That league could not be found." };

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
  if (!Number.isInteger(leagueId) || leagueId < 1) {
    return { success: false, error: "That league could not be found." };
  }

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
