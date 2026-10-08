import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { listLeagues } from "@/lib/leagues";

async function LeagueList() {
  // The SQLite driver is synchronous, so opt out of prerendering explicitly.
  await connection();
  const leagues = listLeagues(getDb());

  if (leagues.length === 0) {
    return (
      <p className="rounded border border-dashed border-border p-6 text-muted">
        No leagues yet.{" "}
        <Link href="/leagues/new" className="font-medium text-link underline">
          Create your first league
        </Link>
        .
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-border text-sm text-muted">
          <th scope="col" className="py-2 pr-4 font-medium">
            League
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Season
          </th>
          <th scope="col" className="py-2 font-medium">
            Teams
          </th>
        </tr>
      </thead>
      <tbody>
        {leagues.map((league) => (
          <tr key={league.id} className="border-b border-border">
            <td className="py-2 pr-4">
              <Link
                href={`/leagues/${league.id}`}
                className="font-medium text-link underline"
              >
                {league.name}
              </Link>
            </td>
            <td className="py-2 pr-4">{league.seasonLabel}</td>
            <td className="py-2">{league.teamCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Home() {
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Leagues</h1>
        <Link
          href="/leagues/new"
          className="rounded bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover"
        >
          New league
        </Link>
      </div>
      <Suspense fallback={<p className="text-muted">Loading leagues...</p>}>
        <LeagueList />
      </Suspense>
    </>
  );
}
