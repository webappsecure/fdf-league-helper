import Link from "next/link";
import { cardSheets, isCardTeam, type CardTeam } from "@/lib/cards";
import type { LeagueDetail } from "@/lib/leagues";
import type { Team } from "@/lib/teams";
import { LeagueGroups } from "../league-groups";
import { PrintCards } from "./print-cards";
import { TeamCard } from "./team-card";

// The teams in the order the page shows them: by conference, then division.
function inScreenOrder(league: LeagueDetail, teams: CardTeam[]): CardTeam[] {
  if (league.conferences.length === 0 && league.divisions.length === 0) return teams;
  const divisions = [
    ...league.conferences.flatMap((conference) => conference.divisions),
    ...league.divisions,
  ];
  return divisions.flatMap((division) => teams.filter((team) => team.divisionId === division.id));
}

// The cards as printed pages: two columns and three rows that fill letter
// paper in landscape edge to edge, so the paper's own edges are card edges and
// only the dotted lines between the cards need cutting.
//
// A cell is 5.5in by 2.833in. At 5.284in wide the card's printing stands
// 0.229in inside its cell on all four sides, the one width where that white
// space is even all around.
//
// The page rule travels with the sheets instead of living in globals.css, so
// only this page prints this way. It is a plain @page rule because Safari
// ignores named pages. No page margin also leaves the browser no room for its
// own header and footer text.
const SHEET_PAGE = "@page { size: letter landscape; margin: 0; }";

function CardSheets({ teams, seasonLabel }: { teams: CardTeam[]; seasonLabel: string }) {
  return (
    <div className="hidden print:block">
      <style>{SHEET_PAGE}</style>
      {cardSheets(teams).map((sheet, number) => (
        <ul
          key={sheet[0].id}
          aria-label={`Sheet ${number + 1}`}
          className="grid h-[8.5in] w-[11in] break-after-page grid-cols-2 grid-rows-3 overflow-hidden last:break-after-auto"
        >
          {sheet.map((team, index) => (
            <li
              key={team.id}
              className={`grid break-inside-avoid place-items-center border-dotted border-border-strong ${index % 2 === 0 ? "border-r-2" : ""} ${index < 4 ? "border-b-2" : ""}`}
            >
              <div className="w-[5.284in]">
                <TeamCard team={team} seasonLabel={seasonLabel} />
              </div>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

// The cards of one season of a league, on screen and as printable sheets.
// `league` carries that season's label and groups, `teams` its teams.
export function SeasonCards({
  league,
  teams,
  back,
}: {
  league: LeagueDetail;
  teams: Team[];
  back: { href: string; label: string };
}) {
  const cardTeams = teams.filter(isCardTeam);
  const complete = cardTeams.length > 0 && cardTeams.length === league.teamCount;
  const shown = league.status !== "setup" && complete;

  return (
    <>
      {/* With cards to print, only the sheets below reach the paper. */}
      <div className={shown ? "print:hidden" : undefined}>
        <p className="mb-2 text-sm">
          <Link href={back.href} className="text-link underline">
            {back.label}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{league.name} team cards</h1>

        {league.status === "setup" && (
          <p className="mt-4 text-muted">Generate this league to see its cards.</p>
        )}
        {league.status !== "setup" && !complete && (
          <p className="mt-4 text-muted">
            Re-roll this league to complete its draft, then view its cards.
          </p>
        )}
        {league.status === "draft" && complete && (
          <p className="mt-4 text-muted">This league is a draft. Its cards may change.</p>
        )}

        {shown && <PrintCards />}
        {shown && (
          <LeagueGroups league={league} teams={cardTeams}>
            {(caption, members) => (
              <ul aria-label={`${caption} cards`} className="mt-3 grid gap-4 sm:grid-cols-2">
                {members.filter(isCardTeam).map((team) => (
                  <li key={team.id} className="border border-border">
                    <TeamCard team={team} seasonLabel={league.seasonLabel} />
                  </li>
                ))}
              </ul>
            )}
          </LeagueGroups>
        )}
      </div>
      {shown && (
        <CardSheets teams={inScreenOrder(league, cardTeams)} seasonLabel={league.seasonLabel} />
      )}
    </>
  );
}
