import Link from "next/link";
import { LeagueForm } from "./league-form";

export default function NewLeaguePage() {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/" className="text-link underline">
          All leagues
        </Link>
      </p>
      <h1 className="mb-6 text-2xl font-semibold">New league</h1>
      <LeagueForm />
    </>
  );
}
