"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { validateLeagueSetup, type ActionFailure } from "@/lib/league-setup";
import { createLeague } from "@/lib/leagues";

export async function createLeagueAction(
  _previous: ActionFailure | null,
  formData: FormData,
): Promise<ActionFailure | null> {
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload")));
  } catch {
    return { success: false, error: "The form could not be read. Reload the page and try again." };
  }

  const result = validateLeagueSetup(payload);
  if (!result.ok) {
    return { success: false, fieldErrors: result.errors };
  }

  let leagueId: number;
  try {
    leagueId = createLeague(getDb(), result.value);
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: "The league could not be saved. Nothing was created. Please try again.",
    };
  }

  revalidatePath("/");
  redirect(`/leagues/${leagueId}`);
}
