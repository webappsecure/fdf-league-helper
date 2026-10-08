import type { FieldError } from "@/lib/league-setup";
import {
  LabeledInput,
  SECONDARY_BUTTON,
  newDivisionRow,
  type DivisionRow,
} from "./form-fields";

export function DivisionRows({
  rows,
  prefix,
  errors,
  onChange,
  onRowCountChange,
}: {
  rows: DivisionRow[];
  // The field path of this list, for example "divisions" or "conferences.1.divisions".
  prefix: string;
  errors: FieldError[];
  onChange: (rows: DivisionRow[]) => void;
  onRowCountChange: () => void;
}) {
  const change = (key: number, patch: Partial<DivisionRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  function resize(next: DivisionRow[]) {
    onRowCountChange();
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.key} className="flex flex-wrap items-start gap-3">
          <div className="min-w-48 flex-1">
            <LabeledInput
              field={`${prefix}.${index}.name`}
              label="Division name"
              errors={errors}
              compact
              type="text"
              value={row.name}
              onChange={(event) => change(row.key, { name: event.target.value })}
            />
          </div>
          <div className="w-28">
            <LabeledInput
              field={`${prefix}.${index}.teamCount`}
              label="Teams"
              errors={errors}
              compact
              type="number"
              min={1}
              value={row.teamCount}
              onChange={(event) => change(row.key, { teamCount: event.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={() => resize(rows.filter((other) => other.key !== row.key))}
            className={`${SECONDARY_BUTTON} mt-6`}
            aria-label={`Remove division ${row.name || index + 1}`}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => resize([...rows, newDivisionRow()])}
        className={SECONDARY_BUTTON}
      >
        Add division
      </button>
    </div>
  );
}
