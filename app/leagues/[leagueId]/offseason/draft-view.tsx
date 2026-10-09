import type { OffseasonDraft } from "@/lib/offseason";
import { DEFENSE_PROFILE_LABELS } from "@/lib/reference/defense-tables";
import { PROFILE_LABELS } from "@/lib/reference/offense-tables";
import { listedText } from "@/lib/cards";
import { ANNUAL_STEPS, ANNUAL_STEP_HEADINGS } from "@/lib/rules/annual-draft";
import { COACH_STEPS, COACH_STEP_HEADINGS } from "@/lib/rules/coaches";
import { CAMP_STEPS, CAMP_STEP_HEADINGS } from "@/lib/rules/training-camp";
import { rerollOffseasonAction } from "../actions";
import { ActionButton } from "../action-button";
import { RunLog } from "../run-log";
import { DiscardOffseason } from "./offseason-actions";

const STEPS = [...COACH_STEPS, ...ANNUAL_STEPS, ...CAMP_STEPS];
const HEADINGS = { ...COACH_STEP_HEADINGS, ...ANNUAL_STEP_HEADINGS, ...CAMP_STEP_HEADINGS };

const PROFILE_COLUMNS = ["Team", "Offense", "Defense"];

const COLUMNS = [
  "Team",
  "Division",
  "Head coach",
  "Grade",
  "Hot seat",
  "Ownership",
  "Front office",
  "FP",
];

// The off-season draft: each team's coach, management and Franchise Points, and
// the log of every roll.
export function DraftView({ leagueId, draft }: { leagueId: number; draft: OffseasonDraft }) {
  return (
    <section aria-labelledby="draft-heading" className="mt-6">
      <h2 id="draft-heading" className="text-xl font-semibold">
        Off-season draft for {draft.seasonLabel}
      </h2>
      <p className="mt-1 text-muted">
        The coaches, Franchise Points, and offense and defense profiles are rolled. Re-roll to run
        it again from the same plan.
      </p>
      <div className="flex flex-wrap gap-3">
        <ActionButton
          action={rerollOffseasonAction.bind(null, leagueId)}
          label="Re-roll off-season"
          pendingLabel="Re-rolling..."
        />
        <DiscardOffseason leagueId={leagueId} />
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <caption className="sr-only">Off-season draft teams</caption>
        <thead>
          <tr className="border-b border-border-strong text-left">
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="py-1 pr-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.teams.map((team) => {
            const ownership = [team.ownershipStyle, team.ownershipLoyalty].filter(Boolean);
            return (
              <tr key={team.id} className="border-b border-border">
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  {team.city} {team.nickname}
                  {team.isNew && <span className="ml-2 font-medium">New</span>}
                </th>
                <td className="py-1 pr-2">{team.divisionName ?? "None"}</td>
                <td className="py-1 pr-2">{team.headCoachName}</td>
                <td className="py-1 pr-2">{team.headCoachGrade}</td>
                <td className="py-1 pr-2">{team.hotSeat ? "Yes" : "No"}</td>
                <td className="py-1 pr-2">
                  {ownership.length > 0 ? ownership.join(", ") : "None"}
                </td>
                <td className="py-1 pr-2">{team.frontOfficeGrade}</td>
                <td className="py-1">{team.franchisePoints}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 className="mt-6 text-lg font-semibold">Offense and defense</h3>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full border-collapse text-sm">
          <caption className="sr-only">Off-season draft offense and defense profiles</caption>
          <thead>
            <tr className="border-b border-border-strong text-left">
              {PROFILE_COLUMNS.map((column) => (
                <th key={column} scope="col" className="py-1 pr-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.teams.map((team) => (
              <tr key={team.id} className="border-b border-border align-top">
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  {team.city} {team.nickname}
                </th>
                <td className="py-1 pr-2">
                  {listedText(PROFILE_LABELS[team.offenseProfile], team.offenseQualities)}
                  {team.offenseSpecialResult && (
                    <span className="block text-muted">{team.offenseSpecialResult}</span>
                  )}
                </td>
                <td className="py-1 pr-2">
                  {listedText(DEFENSE_PROFILE_LABELS[team.defenseProfile], team.defenseQualities)}
                  {team.defenseSpecialResult && (
                    <span className="block text-muted">{team.defenseSpecialResult}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-lg font-semibold">Run log</h3>
      <RunLog entries={draft.log} steps={STEPS} headings={HEADINGS} />
    </section>
  );
}
