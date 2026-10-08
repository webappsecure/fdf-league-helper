import type { FieldError } from "@/lib/league-setup";
import { ConferenceEditor } from "./conference-editor";
import { DivisionRows } from "./division-rows";
import {
  FieldMessage,
  errorFor,
  type ConferenceRow,
  type DivisionRow,
  type StructureKind,
} from "./form-fields";

const STRUCTURE_OPTIONS: { kind: StructureKind; label: string }[] = [
  { kind: "none", label: "No divisions" },
  { kind: "divisions", label: "Divisions" },
  { kind: "conferences", label: "Conferences with divisions" },
];

export function StructureFields({
  kind,
  divisions,
  conferences,
  teamCount,
  errors,
  onKindChange,
  onDivisionsChange,
  onConferencesChange,
  onRowCountChange,
}: {
  kind: StructureKind;
  divisions: DivisionRow[];
  conferences: ConferenceRow[];
  teamCount: string;
  errors: FieldError[];
  onKindChange: (kind: StructureKind) => void;
  onDivisionsChange: (divisions: DivisionRow[]) => void;
  onConferencesChange: (conferences: ConferenceRow[]) => void;
  onRowCountChange: () => void;
}) {
  const assigned = (kind === "divisions"
    ? divisions
    : conferences.flatMap((conference) => conference.divisions)
  ).reduce((sum, row) => sum + (Number(row.teamCount) || 0), 0);

  return (
    <fieldset
      id="field-structure"
      tabIndex={-1}
      aria-describedby={errorFor(errors, "structure") ? "error-structure" : undefined}
    >
      <legend className="font-medium">Structure</legend>
      <div className="mt-2 flex flex-wrap gap-6">
        {STRUCTURE_OPTIONS.map((option) => (
          <label key={option.kind} className="flex items-center gap-2">
            <input
              type="radio"
              name="structureKind"
              checked={kind === option.kind}
              onChange={() => onKindChange(option.kind)}
            />
            {option.label}
          </label>
        ))}
      </div>

      {kind === "divisions" && (
        <div className="mt-4">
          <DivisionRows
            rows={divisions}
            prefix="divisions"
            errors={errors}
            onChange={onDivisionsChange}
            onRowCountChange={onRowCountChange}
          />
        </div>
      )}

      {kind === "conferences" && (
        <ConferenceEditor
          conferences={conferences}
          errors={errors}
          onChange={onConferencesChange}
          onRowCountChange={onRowCountChange}
        />
      )}

      {kind !== "none" && (
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          {assigned} of {Number(teamCount) || 0} teams assigned to divisions.
        </p>
      )}
      <FieldMessage field="structure" errors={errors} />
    </fieldset>
  );
}
