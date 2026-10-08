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
      <p className="rounded border border-dashed border-zinc-300 p-6 text-zinc-600">
        No leagues yet.{" "}
        <Link href="/leagues/new" className="font-medium text-blue-700 underline">
          Create your first league
        </Link>
        .
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-zinc-300 text-sm text-zinc-600">
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
          <tr key={league.id} className="border-b border-zinc-200">
            <td className="py-2 pr-4">
              <Link
                href={`/leagues/${league.id}`}
                className="font-medium text-blue-700 underline"
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
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800"
        >
          New league
        </Link>
      </div>
      <Suspense fallback={<p className="text-zinc-600">Loading leagues...</p>}>
        <LeagueList />
      </Suspense>
    </>
  );
}
