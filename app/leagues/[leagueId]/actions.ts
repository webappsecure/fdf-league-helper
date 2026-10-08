"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import type { ActionFailure } from "@/lib/league-setup";
import { deleteLeague } from "@/lib/leagues";

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
