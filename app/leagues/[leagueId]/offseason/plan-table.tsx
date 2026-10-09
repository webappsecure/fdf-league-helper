import type { LeagueDetail } from "@/lib/leagues";
import type { OffseasonPlan } from "@/lib/offseason-plan";
import type { Team } from "@/lib/teams";
import {
  addExpansionTeamAction,
  cancelMoveAction,
  planMoveAction,
  removeExpansionTeamAction,
  rerollExpansionTeamAction,
  setTeamRemovalAction,
} from "../actions";
import { LeagueGroups } from "../league-groups";
import { PlanButton } from "./plan-button";

function Swatches({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span
        aria-hidden="true"
        className="inline-block size-4 border border-border-strong"
        style={{ background: primary }}
      />
      <span
        aria-hidden="true"
        className="inline-block size-4 border border-border-strong"
        style={{ background: secondary }}
      />
      <span className="sr-only">
        colors {primary} and {secondary}
      </span>
    </span>
  );
}

function CurrentRow({ team, plan }: { team: Team; plan: OffseasonPlan }) {
  const name = `${team.city} ${team.nickname}`;
  const removed = plan.removedTeamIds.includes(team.id);
  const move = plan.moves.find((entry) => entry.teamId === team.id);

  return (
    <tr className="border-b border-border align-top">
      <td className="py-1 pr-2">{name}</td>
      <td className="py-1 pr-2">
        {removed && <p className="font-medium">Leaving the league</p>}
        {move && !removed && move.city === null && <p>Franchise move pending</p>}
        {move && !removed && move.city !== null && <p>Moving to {move.city}</p>}
        {move && removed && <p className="text-muted">Franchise move pending, not planned</p>}
      </td>
      <td className="py-1">
        <div className="flex flex-wrap gap-2">
          <PlanButton
            action={setTeamRemovalAction.bind(null, team.id, !removed)}
            label={removed ? `Keep ${name} in league` : `Remove ${name} from league`}
            pendingLabel="Saving..."
          />
          {move && !removed && (
            <>
              <PlanButton
                action={planMoveAction.bind(null, team.id)}
                label={
                  move.city === null ? `Plan move for ${name}` : `Re-roll new city for ${name}`
                }
                pendingLabel="Rolling..."
              />
              <PlanButton
                action={cancelMoveAction.bind(null, team.id)}
                label={`Cancel move for ${name}`}
                pendingLabel="Saving..."
              />
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function ExpansionRow({ team }: { team: OffseasonPlan["expansionTeams"][number] }) {
  const name = `${team.city} ${team.nickname}`;
  return (
    <tr className="border-b border-border align-top">
      <td className="py-1 pr-2">
        {name} <span className="font-medium">(New)</span>
        <p className="text-muted">
          Head coach {team.headCoachName}{" "}
          <Swatches primary={team.primaryColor} secondary={team.secondaryColor} />
        </p>
      </td>
      <td className="py-1 pr-2">
        Front office {team.frontOfficeGrade}, head coach {team.headCoachGrade}
        <p className="text-muted">
          {team.ownershipStyle ?? "No ownership style"}, {team.ownershipLoyalty ?? "no loyalty"}
        </p>
      </td>
      <td className="py-1">
        <div className="flex flex-wrap gap-2">
          <PlanButton
            action={rerollExpansionTeamAction.bind(null, team.id)}
            label={`Re-roll ${name}`}
            pendingLabel="Rolling..."
          />
          <PlanButton
            action={removeExpansionTeamAction.bind(null, team.id)}
            label={`Remove ${name} from plan`}
            pendingLabel="Saving..."
          />
        </div>
      </td>
    </tr>
  );
}

function GroupTable({
  caption,
  league,
  members,
  divisionId,
  hasStructure,
  plan,
}: {
  caption: string;
  league: LeagueDetail;
  members: Team[];
  divisionId: number | null;
  hasStructure: boolean;
  plan: OffseasonPlan;
}) {
  const planned = plan.expansionTeams.filter((team) => team.divisionId === divisionId);
  return (
    <>
      <table className="mt-2 w-full border-collapse text-sm">
        <caption className="sr-only">{caption} teams</caption>
        <thead>
          <tr className="border-b border-border-strong text-left">
            <th scope="col" className="py-1 pr-2 font-medium">
              Team
            </th>
            <th scope="col" className="py-1 pr-2 font-medium">
              Plan
            </th>
            <th scope="col" className="py-1 font-medium">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((team) => (
            <CurrentRow key={team.id} team={team} plan={plan} />
          ))}
          {planned.map((team) => (
            <ExpansionRow key={team.id} team={team} />
          ))}
        </tbody>
      </table>
      <div className="mt-2">
        <PlanButton
          action={addExpansionTeamAction.bind(null, league.id, divisionId)}
          label={hasStructure ? `Add expansion team to ${caption}` : "Add expansion team"}
          pendingLabel="Adding..."
        />
      </div>
    </>
  );
}

export function PlanTables({
  league,
  teams,
  plan,
}: {
  league: LeagueDetail;
  teams: Team[];
  plan: OffseasonPlan;
}) {
  const hasStructure = league.conferences.length > 0 || league.divisions.length > 0;
  return (
    <LeagueGroups league={league} teams={teams}>
      {(caption, members) => (
        <GroupTable
          caption={caption}
          league={league}
          members={members}
          divisionId={hasStructure ? (members[0]?.divisionId ?? null) : null}
          hasStructure={hasStructure}
          plan={plan}
        />
      )}
    </LeagueGroups>
  );
}
